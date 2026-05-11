// =====================================================
// AI GymTracker — Edge Function: log-workout
// Receives webhook from iOS Shortcut, parses with Claude,
// writes to Supabase tables. Logs every step for debug.
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const VALID_TYPES = ["chest", "back", "legs", "run"] as const;
type WorkoutType = typeof VALID_TYPES[number];

const SYSTEM_PROMPT = `You are a gym workout logging assistant. Return ONLY raw JSON. No text, no markdown, no code fences. Ever.

The user trains 6 days a week. All sets are to failure — never log reps unless explicitly stated. You are given the base program and the user's message. Log what actually happened.

RULES:
- No message or "normal" = log all base program weights unchanged
- Different weight mentioned = use that weight, mark is_deviation true
- Exercise skipped = weight_kg null, skipped true
- New exercise not in base program = add it, is_deviation true
- Notes, feelings, observations = put in notes field
- For runs: extract duration and/or distance if mentioned
- Anything ambiguous = put verbatim in notes, do not guess
- Always return every exercise from the base program, even if unchanged

OUTPUT FORMAT:
{
  "workout_type": "chest",
  "date": "YYYY-MM-DD",
  "notes": "felt strong, shoulder a bit tight" or null,
  "exercises": [
    {
      "exercise_name": "incline_chest_press",
      "weight_kg": 30,
      "skipped": false,
      "is_deviation": true
    }
  ],
  "run": {
    "duration_minutes": 35,
    "distance_km": 5.2
  }
}

Include "exercises" for chest/back/legs. Include "run" only for workout_type "run". is_deviation is true only if weight differs from base program or exercise was added/skipped.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[log-workout] ${req.method} ${url.pathname}`);

  // Browser ping to confirm reachability
  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      message: "log-workout function reachable. POST to log a workout.",
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[log-workout] Missing env vars");
    return jsonResponse({
      success: false,
      error: "Missing env vars: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    }, 500);
  }

  try {
    const rawBody = await req.text();
    console.log(`[log-workout] body: ${rawBody}`);

    let body: { workout_type?: string; message?: string; date?: string } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return jsonResponse({ success: false, error: "Body must be valid JSON" }, 400);
    }

    const workout_type = String(body.workout_type ?? "").toLowerCase().trim() as WorkoutType;
    const message: string = (body.message ?? "").toString();
    const date: string = (body.date ?? "").toString();

    if (!workout_type || !VALID_TYPES.includes(workout_type)) {
      return jsonResponse({
        success: false,
        error: `workout_type must be one of: ${VALID_TYPES.join(", ")} (got "${workout_type}")`,
      }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse({
        success: false,
        error: `date must be in YYYY-MM-DD format (got "${date}")`,
      }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Fetch base program (skip for runs)
    let programText = "(this is a run, no exercises)";
    if (workout_type !== "run") {
      const { data, error } = await supabase
        .from("program")
        .select("exercise_name, default_weight_kg, display_order")
        .eq("workout_type", workout_type)
        .order("display_order", { ascending: true });

      if (error) throw new Error(`Failed to fetch program: ${error.message}`);
      if (!data || data.length === 0) {
        throw new Error(`No program rows found for workout_type "${workout_type}"`);
      }

      programText = data
        .map((p) =>
          `- ${p.exercise_name}: ${p.default_weight_kg === null ? "bodyweight" : p.default_weight_kg + "kg"}`
        )
        .join("\n");
    }

    // 2. Build user prompt
    const userMessage = message.trim() || "(no message — normal session)";
    const userPrompt = `Workout type: ${workout_type}
Date: ${date}

Base program:
${programText}

User's message:
${userMessage}`;

    console.log(`[log-workout] calling Claude (${CLAUDE_MODEL})`);

    // 3. Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const claudeText: string = claudeData?.content?.[0]?.text?.trim() ?? "";
    console.log(`[log-workout] Claude returned ${claudeText.length} chars`);
    if (!claudeText) throw new Error("Claude returned empty response");

    let parsed: {
      workout_type?: string;
      date?: string;
      notes?: string | null;
      exercises?: Array<{
        exercise_name: string;
        weight_kg: number | null;
        skipped?: boolean;
        is_deviation?: boolean;
      }>;
      run?: {
        duration_minutes?: number | null;
        distance_km?: number | null;
        notes?: string | null;
      };
    };
    try {
      parsed = JSON.parse(claudeText);
    } catch {
      throw new Error(`Claude returned invalid JSON: ${claudeText.slice(0, 300)}`);
    }

    // 4. Insert workout row
    const { data: workout, error: wErr } = await supabase
      .from("workouts")
      .insert({
        date: parsed.date || date,
        workout_type,
        raw_message: message || null,
        notes: parsed.notes ?? null,
      })
      .select()
      .single();

    if (wErr) throw new Error(`Failed to insert workout: ${wErr.message}`);

    // 5. Insert sets or run
    if (workout_type === "run") {
      const r = parsed.run ?? {};
      const { error } = await supabase.from("runs").insert({
        workout_id: workout.id,
        duration_minutes: r.duration_minutes ?? null,
        distance_km: r.distance_km ?? null,
        notes: r.notes ?? null,
      });
      if (error) throw new Error(`Failed to insert run: ${error.message}`);
    } else if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
      const rows = parsed.exercises.map((e) => ({
        workout_id: workout.id,
        exercise_name: e.exercise_name,
        weight_kg: e.skipped ? null : (e.weight_kg ?? null),
        skipped: !!e.skipped,
        is_deviation: !!e.is_deviation,
      }));
      const { error } = await supabase.from("sets").insert(rows);
      if (error) throw new Error(`Failed to insert sets: ${error.message}`);
    }

    console.log(`[log-workout] success — workout_id=${workout.id}`);
    return jsonResponse({
      success: true,
      workout_id: workout.id,
      parsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[log-workout] error: ${msg}`);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});

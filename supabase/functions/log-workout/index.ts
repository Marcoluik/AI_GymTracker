// =====================================================
// AI GymTracker — Edge Function: log-workout
// Receives webhook from iOS Shortcut, parses with Claude,
// writes to Supabase tables. Logs every step for debug.
//
// Body shape:
//   {
//     workout_type: "chest" | "back" | "legs" | "abs" | "run",
//     message: string,
//     date: "YYYY-MM-DD",
//     also_abs?: boolean   // if true, ALSO log an abs workout
//                          // (program defaults, no AI). Ignored
//                          // when workout_type is "abs" or "run".
//   }
// =====================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CLAUDE_MODEL = "claude-sonnet-4-5";
const VALID_TYPES = ["chest", "back", "legs", "abs", "run"] as const;
type WorkoutType = typeof VALID_TYPES[number];

const SYSTEM_PROMPT = `You are a gym workout logging assistant. Return ONLY raw JSON. No text, no markdown, no code fences. Ever.

The user trains 6 days/week (chest, back, legs, abs, runs). You are given the base program (each exercise has a default weight, default sets, default reps) and the user's free-form message. Your job is to log what actually happened set-by-set.

CORE RULES
- No message or "normal" / "as planned" = log every program exercise at default_sets × default_reps × default_weight, no deviations.
- Weight differs → use the actual weight on the affected sets, is_deviation true on those sets.
- Reps differ → use the actual reps on the affected sets, is_deviation true on those sets.
- Set count differs → log the actual number of sets (more or fewer than default), mark deviations.
- Per-set values stated (e.g. "bench 80x8, 82.5x8, 82.5x6") → log each set individually with its own weight + reps.
- Exercise skipped → output default_sets entries, each with skipped:true, weight_kg:null, reps:null, is_deviation:true.
- New exercise the user added (not in program) → include it, every set is_deviation:true.
- Always include every program exercise (default or actual).
- For BODYWEIGHT exercises with added load: the weight is the EXTRA load only (belt/vest/plate). Never log total body weight.
- For TIMED exercises (anything with "plank" or "hold" in the name): the "reps" field represents SECONDS held, not rep count. "plank 75s" → reps:75.
- Notes, feelings, observations → "notes" field on the workout. Anything ambiguous → put verbatim into notes, do not guess.

OUTPUT FORMAT (strict)
{
  "workout_type": "chest" | "back" | "legs" | "abs" | "run",
  "date": "YYYY-MM-DD",
  "notes": "felt strong, shoulder a bit tight" | null,
  "exercises": [
    {
      "exercise_name": "incline_chest_press",
      "sets": [
        { "weight_kg": 28, "reps": 8, "skipped": false, "is_deviation": false },
        { "weight_kg": 28, "reps": 8, "skipped": false, "is_deviation": false },
        { "weight_kg": 28, "reps": 7, "skipped": false, "is_deviation": true }
      ]
    }
  ],
  "run": { "duration_minutes": 35, "distance_km": 5.2 } | null
}

Include "exercises" for chest/back/legs/abs (omit or [] for run). Include "run" only for workout_type "run".`;

type ProgramRow = {
  exercise_name: string;
  default_weight_kg: number | null;
  default_sets: number | null;
  default_reps: number | null;
  display_order: number;
  is_bodyweight_base: boolean | null;
};

type SetInsert = {
  workout_id: string;
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
  set_number: number;
  skipped: boolean;
  is_deviation: boolean;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatProgramLine(p: ProgramRow): string {
  const bw = p.is_bodyweight_base === true;
  const sets = p.default_sets ?? 3;
  const reps = p.default_reps ?? 8;
  const isTimed = /plank|hold/.test(p.exercise_name);
  const repsUnit = isTimed ? `${reps}s hold` : `${reps} reps`;
  let weightPart: string;
  if (bw) {
    weightPart =
      p.default_weight_kg === null || p.default_weight_kg === undefined
        ? "bodyweight (no added load)"
        : `bodyweight + ${p.default_weight_kg}kg added load (belt/vest/plate — not total body weight)`;
  } else {
    weightPart =
      p.default_weight_kg === null
        ? "bodyweight"
        : `${p.default_weight_kg}kg`;
  }
  return `- ${p.exercise_name}: ${sets} sets × ${repsUnit} @ ${weightPart}`;
}

async function fetchProgram(
  supabase: SupabaseClient,
  type: WorkoutType,
): Promise<ProgramRow[]> {
  const { data, error } = await supabase
    .from("program")
    .select(
      "exercise_name, default_weight_kg, default_sets, default_reps, display_order, is_bodyweight_base",
    )
    .eq("workout_type", type)
    .order("display_order", { ascending: true });
  if (error) throw new Error(`Failed to fetch program: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`No program rows found for workout_type "${type}"`);
  }
  return data as ProgramRow[];
}

/** Log a workout from program defaults, no AI. Used for the "also_abs" add-on. */
async function logFromDefaults(
  supabase: SupabaseClient,
  type: WorkoutType,
  date: string,
  session_id?: string,
): Promise<{ workout_id: string }> {
  const programRows = await fetchProgram(supabase, type);

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      date,
      workout_type: type,
      raw_message: null,
      notes: null,
      ...(session_id ? { session_id } : {}),
    })
    .select()
    .single();
  if (wErr) throw new Error(`Failed to insert workout: ${wErr.message}`);

  const rows: SetInsert[] = [];
  for (const p of programRows) {
    const sets = p.default_sets ?? 3;
    for (let i = 0; i < sets; i++) {
      rows.push({
        workout_id: workout.id,
        exercise_name: p.exercise_name,
        weight_kg: p.default_weight_kg,
        reps: p.default_reps,
        set_number: i + 1,
        skipped: false,
        is_deviation: false,
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("sets").insert(rows);
    if (error) throw new Error(`Failed to insert sets: ${error.message}`);
  }
  return { workout_id: workout.id };
}

/** Fetch a compact summary of the last logged session of this type (for Claude context). */
async function fetchLastSessionSummary(
  supabase: SupabaseClient,
  type: WorkoutType,
): Promise<string> {
  const { data: lastWorkout } = await supabase
    .from("workouts")
    .select("id, date")
    .eq("workout_type", type)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastWorkout) return "";

  const { data: lastSets } = await supabase
    .from("sets")
    .select("exercise_name, weight_kg, reps, set_number, skipped")
    .eq("workout_id", lastWorkout.id)
    .order("exercise_name", { ascending: true })
    .order("set_number", { ascending: true });

  if (!lastSets || lastSets.length === 0) return "";

  const byEx = new Map<string, typeof lastSets>();
  for (const s of lastSets) {
    const arr = byEx.get(s.exercise_name) ?? [];
    arr.push(s);
    byEx.set(s.exercise_name, arr);
  }

  const lines = [`Last ${type} session (${lastWorkout.date}):`];
  for (const [ex, rows] of byEx) {
    const sets = rows
      .filter((r) => !r.skipped)
      .map((r) => {
        const w = r.weight_kg !== null ? `${r.weight_kg}kg` : "bw";
        return `${w}×${r.reps ?? "?"}`;
      })
      .join(", ");
    lines.push(`- ${ex}: ${sets}`);
  }
  return lines.join("\n");
}

/** Log a workout by sending the message to Claude for parsing. */
async function logViaClaude(
  supabase: SupabaseClient,
  type: WorkoutType,
  message: string,
  date: string,
  session_id?: string,
): Promise<{ workout_id: string; parsed: unknown }> {
  let programRows: ProgramRow[] = [];
  let programText = "(this is a run, no exercises)";
  if (type !== "run") {
    programRows = await fetchProgram(supabase, type);
    programText = programRows.map(formatProgramLine).join("\n");
  }

  const lastSession = await fetchLastSessionSummary(supabase, type);

  const userMessage = message.trim() || "(no message — normal session)";
  const userPrompt = `Workout type: ${type}
Date: ${date}

Base program:
${programText}
${lastSession ? `\n${lastSession}\n` : ""}
User's message:
${userMessage}`;

  console.log(`[log-workout] calling Claude for ${type} (${CLAUDE_MODEL})`);

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
  }
  const claudeData = await claudeRes.json();
  let claudeText: string = claudeData?.content?.[0]?.text?.trim() ?? "";
  console.log(`[log-workout] Claude returned ${claudeText.length} chars`);
  if (!claudeText) throw new Error("Claude returned empty response");
  // Strip markdown code fences if the model wraps its output
  claudeText = claudeText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  type ParsedSet = {
    weight_kg: number | null;
    reps: number | null;
    skipped?: boolean;
    is_deviation?: boolean;
  };
  type ParsedExercise = {
    exercise_name: string;
    sets?: ParsedSet[];
    weight_kg?: number | null;
    skipped?: boolean;
    is_deviation?: boolean;
  };
  let parsed: {
    workout_type?: string;
    date?: string;
    notes?: string | null;
    exercises?: ParsedExercise[];
    run?: {
      duration_minutes?: number | null;
      distance_km?: number | null;
      notes?: string | null;
    } | null;
  };
  try {
    parsed = JSON.parse(claudeText);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${claudeText.slice(0, 300)}`);
  }

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      date: parsed.date || date,
      workout_type: type,
      raw_message: message || null,
      notes: parsed.notes ?? null,
      ...(session_id ? { session_id } : {}),
    })
    .select()
    .single();
  if (wErr) throw new Error(`Failed to insert workout: ${wErr.message}`);

  if (type === "run") {
    const r = parsed.run ?? {};
    const { error } = await supabase.from("runs").insert({
      workout_id: workout.id,
      duration_minutes: r.duration_minutes ?? null,
      distance_km: r.distance_km ?? null,
      notes: r.notes ?? null,
    });
    if (error) throw new Error(`Failed to insert run: ${error.message}`);
  } else if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
    const programByName = new Map(programRows.map((p) => [p.exercise_name, p]));
    const rows: SetInsert[] = [];
    for (const ex of parsed.exercises) {
      const sets = Array.isArray(ex.sets) ? ex.sets : null;
      if (sets && sets.length > 0) {
        sets.forEach((s, i) => {
          rows.push({
            workout_id: workout.id,
            exercise_name: ex.exercise_name,
            weight_kg: s.skipped ? null : (s.weight_kg ?? null),
            reps: s.skipped ? null : (s.reps ?? null),
            set_number: i + 1,
            skipped: !!s.skipped,
            is_deviation: !!s.is_deviation,
          });
        });
      } else {
        const prog = programByName.get(ex.exercise_name);
        const defSets = prog?.default_sets ?? 3;
        const defReps = prog?.default_reps ?? null;
        for (let i = 0; i < defSets; i++) {
          rows.push({
            workout_id: workout.id,
            exercise_name: ex.exercise_name,
            weight_kg: ex.skipped ? null : (ex.weight_kg ?? null),
            reps: ex.skipped ? null : defReps,
            set_number: i + 1,
            skipped: !!ex.skipped,
            is_deviation: !!ex.is_deviation,
          });
        }
      }
    }
    const { error } = await supabase.from("sets").insert(rows);
    if (error) throw new Error(`Failed to insert sets: ${error.message}`);
  }

  return { workout_id: workout.id, parsed };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[log-workout] ${req.method} ${url.pathname}`);

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
      error:
        "Missing env vars: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    }, 500);
  }

  try {
    const rawBody = await req.text();
    console.log(`[log-workout] body: ${rawBody}`);

    let body: {
      workout_type?: string;
      message?: string;
      date?: string;
      also_abs?: unknown;
    } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return jsonResponse(
        { success: false, error: "Body must be valid JSON" },
        400,
      );
    }

    const workout_type = String(body.workout_type ?? "")
      .toLowerCase()
      .trim() as WorkoutType;
    const message: string = (body.message ?? "").toString();
    const date: string = (body.date ?? "").toString();
    const also_abs: boolean = parseFlag(body.also_abs);

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

    // Generate a session_id shared by main + abs so UI can group them
    const session_id = crypto.randomUUID();

    // 1. Main workout — always Claude-parsed
    const main = await logViaClaude(supabase, workout_type, message, date, session_id);

    // Use whatever date Claude determined (handles "yesterday", "11 may", etc.)
    const effectiveDate = (main.parsed as { date?: string })?.date || date;

    // 2. Optional Abs add-on — defaults only, no AI call, same date + session as main
    let abs_workout_id: string | null = null;
    if (also_abs && workout_type !== "abs" && workout_type !== "run") {
      const r = await logFromDefaults(supabase, "abs", effectiveDate, session_id);
      abs_workout_id = r.workout_id;
    }

    console.log(
      `[log-workout] success — workout_id=${main.workout_id}${abs_workout_id ? ` + abs_workout_id=${abs_workout_id}` : ""}`,
    );

    const p = main.parsed as {
      workout_type?: string;
      exercises?: { exercise_name: string; sets?: unknown[] }[];
      notes?: string | null;
    };
    const exCount = p?.exercises?.length ?? 0;
    const setCount = p?.exercises?.reduce((n, e) => n + (e.sets?.length ?? 0), 0) ?? 0;
    const summary = [
      `${workout_type.charAt(0).toUpperCase() + workout_type.slice(1)} logged`,
      exCount > 0 ? `${exCount} exercises · ${setCount} sets` : null,
      abs_workout_id ? "+ Abs (defaults)" : null,
      p?.notes ? `Note: ${p.notes}` : null,
    ].filter(Boolean).join(" · ");

    return jsonResponse({
      success: true,
      summary,
      workout_id: main.workout_id,
      abs_workout_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[log-workout] error: ${msg}`);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});

/** Accept booleans, "true"/"false", "yes"/"no", "1"/"0". Anything else → false. */
function parseFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "yes" || s === "1" || s === "y";
  }
  return false;
}

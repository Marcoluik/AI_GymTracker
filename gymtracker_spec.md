# AI GymTracker — Master Spec

Paste this entire file to Claude when you want to change anything. Claude will produce updated code/configs and tell you exactly which file to replace.

---

## What this system does

I go to the gym 6 days a week. I have 3 workout types: chest, back, legs. Sometimes I run. I have a base program (default weights per exercise). All my sets are to failure so I don't track reps.

After each workout I open an iOS Shortcut on my iPhone. I pick my workout type (chest / back / legs / run) from a menu. A text box appears. I type any differences from my normal session, e.g. "did flies with 40kg instead of 35" or "felt strong today" or just leave it blank if it was normal. The shortcut sends this to my system. AI parses it and logs the workout to my database automatically.

---

## Tech stack

- Database + backend: Supabase (database AND edge functions — one platform, one account)
- AI parsing: Claude API (`claude-sonnet-4-20250514`) called from inside the Supabase edge function
- Trigger: iOS Shortcuts (webhook POST to the edge function URL)
- Code storage: GitHub repo
- Web UI for editing my base program: Supabase table editor (built-in, no extra app needed)

Nothing else. No n8n, no Railway, no Render, no separate server.

---

## Full flow

1. I open iOS Shortcut, pick workout type, optionally type a note.
2. Shortcut sends POST request to Supabase edge function URL with:
   ```json
   { "workout_type": "chest", "message": "did flies with 40kg", "date": "2025-05-08" }
   ```
3. Edge function fetches my base program for that workout type from the `program` table in Supabase.
4. Edge function calls Claude API with the base program + my message.
5. Claude returns structured JSON of what I actually did.
6. Edge function writes the log to the `workouts` and `sets` tables.
7. Done. I never see any of this.

---

## Database schema

**Table: program**
- id (int, primary key)
- workout_type (text) — "chest", "back", "legs"
- exercise_name (text) — snake_case e.g. "incline_chest_press"
- default_weight_kg (float, nullable — NULL means bodyweight)
- display_order (int)
- UNIQUE (workout_type, exercise_name)

**Table: workouts**
- id (uuid, primary key, auto)
- date (date)
- workout_type (text)
- raw_message (text) — what I typed verbatim
- notes (text) — freeform notes Claude extracted
- created_at (timestamp, auto)

**Table: sets**
- id (uuid, primary key, auto)
- workout_id (uuid, foreign key → workouts.id, ON DELETE CASCADE)
- exercise_name (text)
- weight_kg (float, nullable)
- skipped (boolean, default false)
- is_deviation (boolean) — true if different from base program
- created_at (timestamp, auto)

**Table: runs**
- id (uuid, primary key, auto)
- workout_id (uuid, foreign key → workouts.id, ON DELETE CASCADE)
- duration_minutes (int, nullable)
- distance_km (float, nullable)
- notes (text, nullable)

---

## Claude parsing prompt (inside the edge function)

**SYSTEM:**
```
You are a gym workout logging assistant. Return ONLY raw JSON. No text, no markdown, no code fences. Ever.

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

Include "exercises" for chest/back/legs. Include "run" only for workout_type "run". is_deviation is true only if weight differs from base program or exercise was added/skipped.
```

---

## My base program (current)

CHEST:
- incline_chest_press: 28kg
- flat_bench_press: 32kg
- cable_flies: 35kg
- shoulder_press: 24kg
- lateral_raises: 14kg

BACK:
- pull_ups: bodyweight
- seated_cable_row: 60kg
- lat_pulldown: 65kg
- face_pulls: 20kg
- barbell_row: 70kg

LEGS:
- squat: 80kg
- leg_press: 140kg
- romanian_deadlift: 70kg
- leg_extension: 50kg
- leg_curl: 45kg
- calf_raises: 60kg

(Live source of truth is the `program` table in Supabase — edit there.)

---

## Constraints (always)

- Never suggest additional services beyond the tech stack above.
- Never ask the user to write or edit code themselves.
- Never explain how code works unless asked.
- Always give complete files, never diffs or partial snippets.
- Keep it on Supabase free tier forever.
- If something is unclear, make a sensible decision and note it at the top — don't ask questions.

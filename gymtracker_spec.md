# AI GymTracker — Master Spec

Paste this entire file to Claude when you want to change anything. Claude will produce updated code/configs and tell you exactly which file to replace.

---

## What this system does

Two interfaces, one Supabase database:

1. **iOS Shortcut** — after every workout, pick chest/back/legs/run, optionally type what was different. POSTed to a Supabase edge function which calls Claude to parse it and write rows to the DB.
2. **Web app on Netlify** — for editing the base program, browsing past workouts, and viewing trends. Auth via Supabase magic-link email (locked to one email).

Single-user. All sets are to failure so reps are never tracked.

---

## Tech stack

- **Database + Auth**: Supabase (Postgres + Auth + Edge Functions)
- **AI parsing**: Claude API (`claude-sonnet-4-20250514`) called from the edge function
- **iOS Shortcut**: POSTs a JSON webhook to the edge function URL
- **Web app**: React + Vite + TypeScript + Tailwind + Recharts; deployed on Netlify, auto-redeploys from the GitHub repo
- **Code storage**: GitHub repo at `MK-personlig/AI_GymTracker`

Nothing else. No n8n, no Railway, no Vercel, no separate server.

---

## Flows

### Logging a workout (iOS Shortcut)
1. Pick workout type, optionally type a note.
2. Shortcut POSTs `{ workout_type, message, date }` to `/functions/v1/log-workout`.
3. Edge function fetches base program for that type, sends program + user message to Claude.
4. Claude returns structured JSON of what actually happened.
5. Edge function inserts a `workouts` row and either `sets` (for chest/back/legs) or a `runs` row.

### Editing program / browsing data (web app)
1. Open Netlify URL in browser (bookmarked on iPhone home screen).
2. Sign in with email → click magic link → in.
3. Tabs: **Program** (CRUD on `program` table), **Workouts** (list + detail view), **Trends** (charts).

The web app talks directly to Supabase via `@supabase/supabase-js` using the anon key. Row Level Security policies restrict all tables to the authenticated user's email.

---

## Database schema

**Table: program**
- `id` (int, PK)
- `workout_type` (text) — "chest", "back", "legs"
- `exercise_name` (text, snake_case)
- `default_weight_kg` (float, nullable — NULL = bodyweight)
- `display_order` (int)
- UNIQUE (workout_type, exercise_name)

**Table: workouts**
- `id` (uuid, PK, auto)
- `date` (date)
- `workout_type` (text)
- `raw_message` (text) — what was typed verbatim
- `notes` (text) — freeform notes Claude extracted
- `created_at` (timestamptz, auto)

**Table: sets**
- `id` (uuid, PK, auto)
- `workout_id` (uuid, FK → workouts.id, ON DELETE CASCADE)
- `exercise_name` (text)
- `weight_kg` (float, nullable)
- `skipped` (bool, default false)
- `is_deviation` (bool) — true if different from base program
- `created_at` (timestamptz, auto)

**Table: runs**
- `id` (uuid, PK, auto)
- `workout_id` (uuid, FK → workouts.id, ON DELETE CASCADE)
- `duration_minutes` (int, nullable)
- `distance_km` (float, nullable)
- `notes` (text, nullable)

RLS: all four tables have a single `FOR ALL TO authenticated` policy gated on `auth.jwt() ->> 'email' = '<owner_email>'`. The edge function uses the service-role key (bypasses RLS).

---

## Claude parsing prompt (inside log-workout edge function)

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
    { "exercise_name": "incline_chest_press", "weight_kg": 30, "skipped": false, "is_deviation": true }
  ],
  "run": { "duration_minutes": 35, "distance_km": 5.2 }
}

Include "exercises" for chest/back/legs. Include "run" only for workout_type "run". is_deviation is true only if weight differs from base program or exercise was added/skipped.
```

---

## Constraints (always)

- Never suggest additional services beyond the stack above. No Vercel, no Render, no n8n, no separate backend.
- Never ask the user to write or edit code themselves.
- Never explain how code works unless asked.
- Always give complete files, never diffs or partial snippets, with the exact path each file goes at.
- Keep it on Supabase free tier + Netlify free tier forever.
- If something is unclear, make a sensible decision and note it at the top — don't ask questions.
- **Prefer using existing platform features over building custom layers.** If Supabase or Netlify already provides something, use it instead of writing it.

---

## Current owner email
`marcokot@icloud.com` — referenced in `sql/002_rls.sql` and as `VITE_ALLOWED_EMAIL` in Netlify env vars. Update both if changing.

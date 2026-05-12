# AI GymTracker — Master Spec

Paste this entire file to Claude when you want to change anything. Claude will produce updated code/configs and tell you exactly which file to replace.

---

## What this system does

Two interfaces, one Supabase database:

1. **iOS Shortcut** — after every workout, pick chest/back/legs/run, optionally type what was different, then answer a `Abs too? (y/n)` yes/no prompt. POSTed to a Supabase edge function which calls Claude to parse the main workout. If `also_abs:true` the edge function ALSO logs an abs workout for that date by expanding the Abs program defaults (no Claude call). Single HTTP call, one or two `workouts` rows.
2. **Web app on Netlify** — for editing the base program, browsing past workouts, and viewing trends. Auth via Supabase magic-link email (locked to one email).

Single-user. Per-set weight AND reps are tracked. The base program prescribes default sets × default reps × default weight per exercise; Claude expands these on a normal session and only deviates when the user reports something different. For timed exercises (planks, holds) reps store seconds.

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
- `workout_type` (text) — "chest", "back", "legs", "abs"
- `exercise_name` (text, snake_case)
- `default_weight_kg` (float, nullable — NULL = bodyweight)
- `default_sets` (int, nullable)
- `default_reps` (int, nullable — seconds for timed exercises)
- `is_bodyweight_base` (bool) — true for pull-ups, dips, planks etc.; `default_weight_kg` is then ADDED load
- `display_order` (int)
- UNIQUE (workout_type, exercise_name)

**Table: workouts**
- `id` (uuid, PK, auto)
- `date` (date)
- `workout_type` (text) — "chest", "back", "legs", "abs", "run"
- `raw_message` (text) — what was typed verbatim
- `notes` (text) — freeform notes Claude extracted
- `created_at` (timestamptz, auto)

**Table: sets** (one row per set, not per exercise)
- `id` (uuid, PK, auto)
- `workout_id` (uuid, FK → workouts.id, ON DELETE CASCADE)
- `exercise_name` (text)
- `weight_kg` (float, nullable)
- `reps` (int, nullable — seconds for timed exercises like planks)
- `set_number` (int, nullable — 1-indexed within the exercise)
- `skipped` (bool, default false)
- `is_deviation` (bool) — true if this set differs from program defaults
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

See `supabase/functions/log-workout/index.ts` for the live prompt. Summary:

- Output is a JSON object with `workout_type`, `date`, `notes`, `exercises[]`, and optionally `run`.
- Each `exercises[]` item has a `sets[]` array. Each set is `{ weight_kg, reps, skipped, is_deviation }`.
- Default behavior on a "normal" session: expand each program exercise into `default_sets` sets at `default_weight_kg` × `default_reps`.
- Per-set logging is supported: user says "bench 80×8, 80×8, 80×6" → 3 set rows with the last marked deviation.
- Timed exercises (anything with "plank" or "hold" in the name): `reps` stores seconds, not rep count.
- Bodyweight exercises with added load: `weight_kg` is the EXTRA load only.

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

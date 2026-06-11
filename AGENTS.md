# AI GymTracker — Codex context

## What this project is
Single-user personal gym tracker. Marco logs workouts via iOS Shortcut → Supabase Edge Function → Codex API (parses natural language) → Postgres DB. Web app on Netlify for editing the program and viewing past workouts.

## Stack (fixed — do not introduce other services)
- **Supabase** (`zyqfxdewrjrewgcpxcxt`): Postgres + Auth (magic-link) + Edge Functions (Deno/TS)
- **Anthropic**: `Codex-sonnet-4-20250514` — do NOT upgrade model without asking
- **GitHub**: `MK-personlig/AI_GymTracker`
- **Netlify**: site `mkgymai` → `https://mkgymai.netlify.app` — auto-deploys on push
- **Frontend**: Vite + React + TypeScript + Tailwind + Recharts (in `/web`)

## Workout types
`chest`, `back`, `legs`, `abs`, `run`. Each has a program section in the web app. The iOS Shortcut menu only offers chest/back/legs/run — abs is asked as a `also_abs: y/n` prompt after the main workout. When `also_abs=true` the edge function logs the main workout via Codex AND inserts a second abs workout straight from program defaults (no AI call).

## Sets + reps model
- `sets` is per-set, not per-exercise (3 sets of bench = 3 rows). Columns: `weight_kg`, `reps`, `set_number`, `skipped`, `is_deviation`.
- `program` rows have `default_sets` and `default_reps`. Codex expands a "normal" session into N sets at the defaults.
- For timed exercises (name matches `plank|hold`), `reps` represents seconds. UI detects this and renders `60s` instead of `× 60`.

## Owner
- Email: `marcokot@icloud.com`
- This email appears in TWO places: the SQL RLS policy AND the `VITE_ALLOWED_EMAIL` Netlify env var. Update both if it ever changes.

## Repo layout
```
netlify.toml                          ← REPO ROOT (not inside web/)
sql/
  init.sql                            ← schema + program seed data
  002_rls.sql                         ← RLS policies (gates all tables to owner email)
supabase/
  config.toml                         ← verify_jwt = false for log-workout
  functions/log-workout/index.ts      ← only edge function; called by iOS Shortcut
web/
  .env.example                        ← placeholder values only (no real secrets)
  src/
    lib/supabase.ts
    App.tsx
    pages/  Program, Workouts, WorkoutDetail, Trends, Login
gymtracker_spec.md                    ← master spec; user re-pastes to trigger upgrades
```

## Secrets — where they live (never commit real values)
| Secret | Where set |
|--------|-----------|
| `VITE_SUPABASE_URL` | Netlify dashboard env vars |
| `VITE_SUPABASE_ANON_KEY` | Netlify dashboard env vars |
| `VITE_ALLOWED_EMAIL` | Netlify dashboard env vars |
| `ANTHROPIC_API_KEY` | Supabase secrets (`supabase secrets set`) |
| `SUPABASE_ACCESS_TOKEN` | Your machine only — [Supabase account tokens](https://supabase.com/dashboard/account/tokens); **never commit** (GitHub push protection blocks it) |
| Supabase service-role key | Used inside edge function only (set as Supabase secret or hardcoded carefully) |

## Key design decisions
- `verify_jwt = false` in `supabase/config.toml` — iOS Shortcut sends no auth header, gateway must not reject it
- Edge function uses **service-role key** → bypasses RLS. Web app uses **anon key** → RLS gates everything to owner email.
- `VITE_*` vars are public by design (Vite inlines them into the browser bundle). Secured by RLS, not by hiding the anon key. Netlify scanner is told to skip them via `SECRETS_SCAN_OMIT_KEYS`.
- Build command is `vite build` (not `tsc -b && vite build`) — Vite uses esbuild to strip types; tsc is a separate `typecheck` script.
- `netlify.toml` must live at **repo root** — Netlify ignores it if it's inside `web/`.

## Deploying edge functions
Marco's local machine may be logged into a different Supabase account than this project. Use a **personal access token** from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens), then:
```bash
export SUPABASE_ACCESS_TOKEN="(paste token here — keep out of git)"
supabase functions deploy log-workout --project-ref zyqfxdewrjrewgcpxcxt --no-verify-jwt
```
For database migrations: `supabase db push` (same `SUPABASE_ACCESS_TOKEN`; project is linked under `supabase/.temp/`).

## Pushing to GitHub
Marco's local git is on a different GitHub account. The remote uses a PAT embedded in the URL:
```
git remote set-url origin https://TOKEN@github.com/MK-personlig/AI_GymTracker.git
```
(Token is stored in Marco's 1Password / keychain — ask him if needed.)

## Useful dashboard links
- Supabase project: https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt
- Supabase SQL editor: https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt/sql/new
- Supabase function logs: https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt/functions
- Supabase auth URL config: https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt/auth/url-configuration
- Netlify dashboard: https://app.netlify.com (site: `mkgymai`)

## Rules for Codex
- User is non-technical. Never ask him to edit code. Never produce diffs/snippets — always full files with explicit "save this as path/to/file" instructions.
- Never add features beyond what's asked. No abstractions, no future-proofing.
- If a request smells like overengineering (edge functions serving HTML, hand-rolled auth, etc.), push back and propose the simpler platform-native approach first.
- `gymtracker_spec.md` is the master spec. When user pastes it with a change request, return complete updated files.

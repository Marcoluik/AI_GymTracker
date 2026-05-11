# AI GymTracker

Personal gym tracking. iOS Shortcut → Supabase Edge Function → Claude parses → Supabase tables. Single-user, free-tier forever.

## Repo layout
```
AI_GymTracker/
├── README.md                                # this file
├── gymtracker_spec.md                       # the master spec — paste this back to Claude to upgrade
├── sql/
│   └── init.sql                             # tables + indexes + base program seed
├── supabase/
│   └── functions/
│       └── log-workout/
│           └── index.ts                     # the only edge function
└── docs/
    ├── deployment.md                        # one-time setup steps
    └── ios-shortcut.md                      # how to build the iPhone shortcut
```

## Quick start
1. Read [`docs/deployment.md`](docs/deployment.md) and follow every step.
2. Then build the iOS Shortcut from [`docs/ios-shortcut.md`](docs/ios-shortcut.md).
3. Done. Open the shortcut after every workout.

## How to upgrade later
Open [`gymtracker_spec.md`](gymtracker_spec.md), paste the whole file to Claude along with whatever change you want, and Claude will return updated code with instructions on what to replace.

## What lives where
- **Base program** — Supabase `program` table. Edit in the Supabase Table Editor (web UI).
- **Workouts** — Supabase `workouts`, `sets`, `runs` tables. Written by the edge function.
- **Edge function code** — this repo, deployed via `supabase functions deploy log-workout`.
- **Anthropic API key** — Supabase secret (`supabase secrets set ANTHROPIC_API_KEY=...`).

## Tech stack
- Supabase (Postgres + Edge Functions)
- Anthropic Claude API (`claude-sonnet-4-20250514`)
- iOS Shortcuts
- That's it. No other services.

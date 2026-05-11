# AI GymTracker

Personal gym tracking system. Two interfaces, one database:

1. **iOS Shortcut** → Supabase Edge Function → Claude parses → tables (workout logging from your phone after the gym)
2. **Web app on Netlify** → Supabase (browse, edit program, view trends — everything else)

Single-user, free tier forever.

## Repo layout

```
AI_GymTracker/
├── README.md
├── gymtracker_spec.md           # the master spec — paste back to Claude to upgrade
├── sql/
│   ├── init.sql                 # tables + indexes + base program seed
│   └── 002_rls.sql              # Row Level Security policies
├── supabase/
│   ├── config.toml
│   └── functions/
│       └── log-workout/         # iOS Shortcut → Claude → tables
├── web/                         # React + Vite + Tailwind app, deployed on Netlify
│   ├── src/
│   ├── package.json
│   ├── netlify.toml
│   └── ...
└── docs/
    ├── deployment.md            # Supabase setup
    ├── netlify-deploy.md        # web app deployment
    └── ios-shortcut.md          # iPhone shortcut build
```

## Quick start

1. [`docs/deployment.md`](docs/deployment.md) — set up Supabase project, deploy the edge function
2. [`docs/netlify-deploy.md`](docs/netlify-deploy.md) — deploy the web app
3. [`docs/ios-shortcut.md`](docs/ios-shortcut.md) — build the iPhone shortcut

## Tech stack
- Supabase (Postgres + Auth + Edge Functions)
- Anthropic Claude API (`claude-sonnet-4-20250514`)
- React + Vite + TypeScript + Tailwind + Recharts (web app)
- Netlify (web hosting, auto-deploy from GitHub)
- iOS Shortcuts
- No other services.

## How to upgrade later
Paste [`gymtracker_spec.md`](gymtracker_spec.md) to Claude along with what you want changed. Claude returns updated files with instructions on what to replace.

# Supabase Deployment — One-time Setup

This covers the Supabase side (database + edge function for iOS Shortcut). For the web app, see `docs/netlify-deploy.md`. For the iPhone shortcut, see `docs/ios-shortcut.md`.

## 0. Prereqs (one-time install)
On your Mac, open **Terminal**:
```bash
brew install supabase/tap/supabase
```

Get an **Anthropic API key** from https://console.anthropic.com/settings/keys and charge a small balance ($5 lasts months).

---

## 1. Create the Supabase project
1. https://supabase.com/dashboard → **New project**.
2. Name: `AI_GymTracker`. Strong DB password. Free plan. Region near you.
3. Wait ~2 minutes for it to spin up.

Then grab:
- **Project Reference ID** — Settings → General
- **Service role key** — Settings → API → `service_role` (secret)
- **Anon (public) key** — Settings → API → `anon` (used by the web app)

---

## 2. Run the SQL
For each file in `sql/`, in order:
1. Dashboard → **SQL Editor** → **New query**.
2. Paste contents of `sql/init.sql` → **Run**.
3. New query → paste `sql/002_rls.sql` → **Run**.

Verify in **Table Editor**: four tables (`program`, `workouts`, `sets`, `runs`), all showing a tiny lock icon (RLS enabled). The `program` table has rows from the seed.

---

## 3. Deploy the edge function
```bash
cd /Users/marcoluik/AI_GymTracker
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy log-workout
```

Function URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout`

---

## 4. Set the Anthropic secret
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — don't set them.

Verify: `supabase secrets list` → `ANTHROPIC_API_KEY` should appear.

---

## 5. Test the edge function
Open in browser (replace `YOUR-PROJECT-REF`):
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout
```
You should see `{"ok":true,"message":"log-workout function reachable. POST to log a workout."}`.

Then test a workout via curl:
```bash
curl -X POST 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout' \
  -H 'Content-Type: application/json' \
  -d '{"workout_type":"chest","message":"flies at 40kg, felt strong","date":"2026-05-11"}'
```
Expect `{"success":true,...}`. Check **Table Editor → workouts** for the new row.

---

## 6. Now do the other two pieces
- `docs/netlify-deploy.md` — deploy the web app
- `docs/ios-shortcut.md` — build the iPhone shortcut

---

## Debugging
**Function logs**: Dashboard → **Edge Functions** → `log-workout` → **Logs** tab. Look for `[log-workout]` prefixes — they show body received, Claude calls, errors.

## Redeploying after code changes
```bash
cd /Users/marcoluik/AI_GymTracker
supabase functions deploy log-workout
```

# Deployment — One-time Setup

Do these steps in order. Each step says exactly what to type or click.

## 0. Prereqs (one-time install)
On your Mac, open **Terminal** and run:
```bash
brew install supabase/tap/supabase
```
If you don't have Homebrew, install it first from https://brew.sh.

You also need an **Anthropic API key** from https://console.anthropic.com/settings/keys. Save it somewhere — you'll paste it later. Charge a small balance ($5 is plenty for many months of use).

---

## 1. Create the Supabase project
1. Go to https://supabase.com/dashboard and sign in (free account).
2. Click **New project**.
3. Name: `gymtracker` (anything).
4. Database password: generate a strong one and save it in your password manager.
5. Region: pick whichever is closest to you.
6. Plan: **Free**.
7. Click **Create new project** and wait ~2 minutes.

When it's ready, find these two values (you'll need both):

- **Project Reference ID** — Settings → General → "Reference ID" (looks like `abcdefghijklmnop`)
- **Service role key** — Settings → API → "Project API keys" → `service_role` (secret — never share)

---

## 2. Run the SQL
1. In Supabase dashboard → left sidebar → **SQL Editor** → **New query**.
2. Open `sql/init.sql` from this repo, copy everything, paste into the SQL editor.
3. Click **Run** (bottom right).
4. Verify in **Table Editor**: you should see four tables (`program`, `workouts`, `sets`, `runs`) and `program` should have rows.

---

## 3. Deploy the edge functions
In Terminal:
```bash
cd /Users/marcoluik/AI_GymTracker
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy log-workout
supabase functions deploy program-editor
```

Function URLs:
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout
https://YOUR-PROJECT-REF.supabase.co/functions/v1/program-editor
```

---

## 4. Set environment variables
The functions need two secrets. Pick any random string for `ADMIN_TOKEN` (this protects the program editor):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
supabase secrets set ADMIN_TOKEN=any-random-string-you-pick
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — don't set them manually.

Verify:
```bash
supabase secrets list
```
Both should appear.

---

## 5. Test it

### 5a. Confirm the function is reachable
Open this in your browser (replace `YOUR-PROJECT-REF`):
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout
```
Expected: a JSON message saying `"log-workout function reachable"`. If you see this, the function is live and the gateway is letting requests through.

### 5b. Test logging a workout via curl
```bash
curl -X POST 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout' \
  -H 'Content-Type: application/json' \
  -d '{
    "workout_type": "chest",
    "message": "did flies with 40kg instead of 35, felt strong",
    "date": "2026-05-11"
  }'
```

Expected:
```json
{ "success": true, "workout_id": "...", "parsed": {...} }
```

Then check **Table Editor** → `workouts` (new row) and `sets` (5 chest exercises with `cable_flies` at 40kg, `is_deviation=true`).

### 5c. Open the program editor
Visit in your browser (replace both placeholders):
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/program-editor?token=YOUR_ADMIN_TOKEN
```
You should see all your exercises grouped by workout type. Edit inline; changes save on blur. See `docs/program-editor.md`.

---

## 6. Build the iOS Shortcut
Follow `docs/ios-shortcut.md`.

---

## Debugging

**Function logs**: Supabase dashboard → **Edge Functions** → click `log-workout` → **Logs** tab. You should see lines starting with `[log-workout]` for every request. If you only see `Booted` and nothing else, no request is reaching the function (URL is wrong, or you haven't actually invoked it).

**Things to try if a request fails**:
- Re-run step 5a in a browser. If it doesn't return the "reachable" JSON, the URL is wrong.
- Re-run step 5b with curl. The response body tells you exactly what went wrong.
- Check **Logs** for `[log-workout] body:` lines to see what's actually being received.

---

## Redeploying after code changes
```bash
cd /Users/marcoluik/AI_GymTracker
supabase functions deploy log-workout       # or program-editor
```

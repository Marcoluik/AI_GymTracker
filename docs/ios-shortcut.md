# iOS Shortcut — "Log Workout"

This shortcut shows a menu, asks for a note, sends everything to your edge function.

You will need this URL ready (you'll get it from the deployment step):
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout
```

Authorization is **not required** — the function is open (protected by URL obscurity). No anon key, no Bearer token needed.

---

## Step-by-step build

Open the **Shortcuts** app on your iPhone → tap **+** (top right) → **New Shortcut** → tap the name field at the top and call it **Log Workout**.

Then add the actions below in this exact order. Tap **+ Add Action** between each one. Use the search box at the top of the action picker to find them.

### Action 1 — Choose from Menu
- Search: **Choose from Menu**
- Tap **Prompt** and type: `Workout type?`
- Tap **One** → rename to `chest`
- Tap **Two** → rename to `back`
- Tap **Add new item** → `legs`
- Tap **Add new item** → `run`

You'll now see four sub-branches: **chest**, **back**, **legs**, **run**, each with an empty body.

### Actions 2 + 3 (×4) — inside each menu branch
Inside each of the four branches, add **two** actions:

1. **Text** action with the lowercase branch name as its content (`chest`, `back`, `legs`, or `run`).
2. **Set Variable** action:
   - Variable Name: `workoutType`
   - Input: the magic variable pointing at the **Text** action above it (it auto-fills).

(Tip: build the first branch fully, then long-press both actions → Copy → paste into the other three branches, then change only the Text content.)

### Action 4 — Ask for Input (after the Menu block, not inside any branch)
- Search: **Ask for Input**
- Input Type: **Text**
- Prompt: `What was different today?`
- Default Answer: leave empty
- Tap the small `>` to expand → **Allow Multiple Lines**: ON

### Action 5 — Set Variable
- Variable Name: `note`
- Input: the magic variable **Provided Input** (auto-fills).

### Action 6 — Format Date
- Search: **Format Date**
- Date: tap the field → choose **Current Date**
- Format: tap **Date Format** → **Custom**
- Custom Format String: `yyyy-MM-dd`

### Action 7 — Set Variable
- Variable Name: `today`
- Input: the magic variable **Formatted Date** (auto-fills).

### Action 8 — Dictionary
- Search: **Dictionary**
- Tap **Add new item** three times:
  1. Key: `workout_type` — Type: **Text** — Value: variable `workoutType`
  2. Key: `message` — Type: **Text** — Value: variable `note`
  3. Key: `date` — Type: **Text** — Value: variable `today`

### Action 9 — Get Contents of URL
- Search: **Get Contents of URL**
- URL: paste your function URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/log-workout`
- Tap **Show More**:
  - Method: **POST**
  - Request Body: **JSON**
  - Headers: tap **Add new header** once:
    - `Content-Type` → `application/json`
  - **JSON Body**: tap **Add new field**, set type to **Dictionary**, tap value → pick the **Dictionary** variable from Action 8.
    (Or simpler: drop the **Dictionary** variable in as the whole body — Shortcuts will accept it.)

### Action 10 (recommended) — Show Notification
- Search: **Show Notification**
- Title: `Workout logged`
- Body: tap field → pick **Contents of URL** (this shows the function's response so you can confirm it worked)

---

## Add to Home Screen
1. Open the shortcut → tap the small **(i)** info button at the bottom.
2. Tap **Add to Home Screen**.
3. Choose an icon and name (e.g. "Gym").
4. Tap **Add**.

---

## Troubleshooting

If the notification shows `{"success":false,"error":"..."}`, that error message tells you exactly what went wrong. Paste it back to Claude (with `gymtracker_spec.md`) for a fix.

If you don't see a notification at all, the URL is wrong — re-check Action 9.

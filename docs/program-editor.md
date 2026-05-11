# Program Editor — Simple Web UI

A tiny web page for editing your base program. Lives at:
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/program-editor?token=YOUR_ADMIN_TOKEN
```

Bookmark this on iPhone and Mac. Inline edit, blur to save, × to delete, "Add" to insert a new exercise.

## One-time setup
After deploying the function (see `docs/deployment.md`), set your admin token:
```bash
supabase secrets set ADMIN_TOKEN=anything-secret-you-pick
```
Then visit the URL with `?token=anything-secret-you-pick` at the end.

## Add to iPhone Home Screen
1. Open the URL in Safari on iPhone.
2. Tap the share icon → **Add to Home Screen** → name it "Gym Program".

Now it's a one-tap icon next to your "Log Workout" shortcut.

# Netlify Deployment — Web App

One-time setup for the React app in `/web`. After this, every `git push` auto-redeploys.

---

## 1. Enable RLS in Supabase
1. Open https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt/sql/new
2. Open `sql/002_rls.sql` from this repo, copy everything, paste into the SQL editor.
3. Click **Run**. Should say "Success. No rows returned."

This locks all tables to your email (`marcokot@icloud.com`) only.

---

## 2. Configure Supabase Auth
The magic-link emails need to know which URLs to redirect to. We'll come back here after we know the Netlify URL.

For now, gather these two values — you'll need them in step 3:
- **Project URL**: https://zyqfxdewrjrewgcpxcxt.supabase.co
- **Anon (public) key**: Supabase dashboard → Settings → API → `anon` `public` (starts with `eyJ…`). Copy this.

---

## 3. Connect GitHub to Netlify
1. Go to https://app.netlify.com (sign up free if you don't have an account).
2. Click **Add new site** → **Import an existing project** → **Deploy with GitHub**.
3. Authorize Netlify to access **MK-personlig** account if prompted.
4. Pick the **AI_GymTracker** repo.
5. Build settings should be auto-detected from `web/netlify.toml`:
   - Base directory: `web`
   - Build command: `npm run build`
   - Publish directory: `web/dist`

   If not, set them manually.
6. Click **Add environment variables** (or "Show advanced") and add three vars:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://zyqfxdewrjrewgcpxcxt.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | (the anon key you copied in step 2) |
   | `VITE_ALLOWED_EMAIL` | `marcokot@icloud.com` |

7. Click **Deploy site**. First build takes ~2 minutes.

When it's done, Netlify gives you a URL like `https://random-words-12345.netlify.app`.

---

## 4. Tell Supabase about your Netlify URL
Magic-link emails need an allow-listed redirect URL or they won't work.

1. Open https://supabase.com/dashboard/project/zyqfxdewrjrewgcpxcxt/auth/url-configuration
2. **Site URL**: paste your Netlify URL (e.g. `https://random-words-12345.netlify.app`)
3. **Redirect URLs** → **Add URL**: paste the same URL (you can add `http://localhost:5173` too if you ever want to develop locally).
4. Click **Save**.

---

## 5. Optional: pick a friendlier Netlify subdomain
1. Netlify dashboard → your site → **Site configuration** → **Change site name**.
2. Pick something like `mk-gym-tracker` → URL becomes `https://mk-gym-tracker.netlify.app`.
3. If you change it, go back to step 4 and update Supabase **Site URL** and **Redirect URLs** to the new URL.

---

## 6. First sign-in
1. Open your Netlify URL in a browser.
2. Enter `marcokot@icloud.com` → click **Send magic link**.
3. Open your email, click the link → you land back in the app, signed in.
4. Add to iPhone home screen: Safari → share icon → **Add to Home Screen**.

---

## How updates work from now on
Make any code change → `git push` → Netlify rebuilds automatically (you'll see it in their dashboard). No CLI needed for deploys.

For new SQL migrations: paste them into the Supabase SQL Editor manually.

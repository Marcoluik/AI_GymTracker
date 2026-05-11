// =====================================================
// AI GymTracker — Edge Function: program-editor
// Serves a tiny HTML editor for the `program` table.
// Visit:  https://<ref>.supabase.co/functions/v1/program-editor?token=YOUR_ADMIN_TOKEN
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") ?? "";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gym Program</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 0 auto; padding: 1rem; color: #222; background: #fafafa; }
  h1 { margin: 0 0 0.25rem; }
  .sub { color: #666; margin-bottom: 1.5rem; font-size: 0.9rem; }
  .section { background: white; border: 1px solid #e3e3e3; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .section h2 { margin: 0 0 0.75rem; text-transform: capitalize; font-size: 1.1rem; color: #444; }
  .head, .row, .add { display: grid; grid-template-columns: 2.5fr 1fr 0.7fr auto; gap: 0.5rem; align-items: center; }
  .head { padding: 0 0 0.4rem; font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .row { padding: 0.4rem 0; border-bottom: 1px solid #f0f0f0; }
  .row:last-of-type { border-bottom: none; }
  input { padding: 0.45rem 0.55rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.95rem; width: 100%; background: white; font-family: inherit; }
  input.saved { background: #e8f5e8; transition: background 0.5s; }
  input:focus { outline: none; border-color: #888; }
  button { cursor: pointer; font-family: inherit; }
  .row .del { background: none; border: none; color: #c00; font-size: 1.3rem; padding: 0 0.4rem; }
  .add { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed #ddd; }
  .add button { background: #222; color: white; border: none; border-radius: 4px; padding: 0.45rem 0.9rem; font-size: 0.9rem; }
  .err { color: #c00; padding: 0.75rem; background: #fee; border-radius: 6px; }
  .ok { color: #0a0; padding: 0.5rem 0; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>Gym Program</h1>
  <div class="sub">Edit weights inline — changes save when you leave the field. Leave weight blank for bodyweight exercises.</div>
  <div id="app">Loading…</div>
<script>
const TOKEN = new URLSearchParams(location.search).get("token") || "";
const BASE = location.pathname.replace(/\\/$/, "");
const API = BASE + "/api?token=" + encodeURIComponent(TOKEN);
const TYPES = ["chest", "back", "legs"];

async function api(method, body, extraQs) {
  const res = await fetch(API + (extraQs || ""), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ": " + text);
  return text ? JSON.parse(text) : null;
}

function flash(el) {
  el.classList.add("saved");
  setTimeout(() => el.classList.remove("saved"), 800);
}

function rowEl(r, type) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    '<input value="' + (r.exercise_name || "") + '" data-f="exercise_name">' +
    '<input value="' + (r.default_weight_kg == null ? "" : r.default_weight_kg) + '" data-f="default_weight_kg" type="number" step="0.5" placeholder="bodyweight">' +
    '<input value="' + (r.display_order ?? 0) + '" data-f="display_order" type="number">' +
    '<button class="del" title="Delete">×</button>';

  row.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", async () => {
      try {
        const w = row.querySelector('[data-f=default_weight_kg]').value;
        await api("POST", {
          id: r.id,
          workout_type: type,
          exercise_name: row.querySelector('[data-f=exercise_name]').value.trim(),
          default_weight_kg: w === "" ? null : parseFloat(w),
          display_order: parseInt(row.querySelector('[data-f=display_order]').value, 10) || 0,
        });
        flash(input);
      } catch (e) { alert(e.message); }
    });
  });

  row.querySelector(".del").addEventListener("click", async () => {
    if (!confirm('Delete "' + r.exercise_name + '"?')) return;
    try {
      await api("DELETE", null, "&id=" + r.id);
      load();
    } catch (e) { alert(e.message); }
  });

  return row;
}

function sectionEl(type, rows) {
  const sec = document.createElement("div");
  sec.className = "section";
  sec.innerHTML =
    '<h2>' + type + '</h2>' +
    '<div class="head"><div>Exercise</div><div>Weight (kg)</div><div>Order</div><div></div></div>' +
    '<div data-rows></div>' +
    '<div class="add">' +
      '<input placeholder="new_exercise_name" data-n="name">' +
      '<input placeholder="kg (blank = bodyweight)" data-n="weight" type="number" step="0.5">' +
      '<input placeholder="order" data-n="order" type="number">' +
      '<button data-add>Add</button>' +
    '</div>';
  const rowsDiv = sec.querySelector("[data-rows]");
  rows.forEach(r => rowsDiv.appendChild(rowEl(r, type)));

  sec.querySelector("[data-add]").addEventListener("click", async () => {
    const name = sec.querySelector('[data-n=name]').value.trim();
    const wRaw = sec.querySelector('[data-n=weight]').value;
    const oRaw = sec.querySelector('[data-n=order]').value;
    if (!name) { alert("Exercise name required"); return; }
    try {
      await api("POST", {
        workout_type: type,
        exercise_name: name,
        default_weight_kg: wRaw === "" ? null : parseFloat(wRaw),
        display_order: oRaw === "" ? (rows.length + 1) : parseInt(oRaw, 10),
      });
      load();
    } catch (e) { alert(e.message); }
  });
  return sec;
}

async function load() {
  try {
    const rows = await api("GET");
    const byType = {};
    TYPES.forEach(t => byType[t] = []);
    (rows || []).forEach(r => {
      if (!byType[r.workout_type]) byType[r.workout_type] = [];
      byType[r.workout_type].push(r);
    });
    const app = document.getElementById("app");
    app.innerHTML = "";
    TYPES.forEach(t => app.appendChild(sectionEl(t, byType[t])));
  } catch (e) {
    document.getElementById("app").innerHTML = '<div class="err">' + e.message + '</div>';
  }
}

if (!TOKEN) {
  document.getElementById("app").innerHTML = '<div class="err">Missing <code>?token=</code> in URL. Append <code>?token=YOUR_ADMIN_TOKEN</code> to the URL.</div>';
} else {
  load();
}
</script>
</body>
</html>`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const isApi = url.pathname.endsWith("/api");

  console.log(`[program-editor] ${req.method} ${url.pathname} isApi=${isApi}`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Server missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }
  if (!ADMIN_TOKEN) {
    return new Response(
      "ADMIN_TOKEN env var not set on the server. Run:\n  supabase secrets set ADMIN_TOKEN=your-chosen-secret",
      { status: 500 },
    );
  }
  if (token !== ADMIN_TOKEN) {
    return new Response("Unauthorized — missing or wrong ?token=", { status: 401 });
  }

  // Serve HTML for any non-/api path
  if (!isApi) {
    return new Response(HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ---- JSON API ----
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("program")
        .select("*")
        .order("workout_type", { ascending: true })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const payload = {
        workout_type: String(body.workout_type ?? "").toLowerCase().trim(),
        exercise_name: String(body.exercise_name ?? "").trim(),
        default_weight_kg: body.default_weight_kg === null || body.default_weight_kg === undefined
          ? null
          : Number(body.default_weight_kg),
        display_order: Number.isFinite(body.display_order) ? Number(body.display_order) : 0,
      };
      if (!payload.workout_type || !payload.exercise_name) {
        return jsonResponse({ error: "workout_type and exercise_name required" }, 400);
      }

      if (body.id) {
        const { error } = await supabase.from("program").update(payload).eq("id", body.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("program").insert(payload);
        if (error) throw error;
      }
      return jsonResponse({ success: true });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResponse({ error: "missing ?id=" }, 400);
      const { error } = await supabase.from("program").delete().eq("id", id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[program-editor] ${msg}`);
    return jsonResponse({ error: msg }, 500);
  }
});

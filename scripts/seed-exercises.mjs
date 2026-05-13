// Node.js version of the seed script (no Deno required)
const EXERCISES_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

console.log("Fetching exercises from free-exercise-db…");
const res = await fetch(EXERCISES_URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const raw = await res.json();
console.log(`Got ${raw.length} exercises.`);

const rows = raw.map((e) => ({
  id: e.id.toLowerCase(),
  name: e.name,
  category: e.category ?? null,
  level: e.level ?? null,
  equipment: e.equipment ?? null,
  primary_muscles: e.primaryMuscles ?? [],
  secondary_muscles: e.secondaryMuscles ?? [],
  force: e.force ?? null,
  mechanic: e.mechanic ?? null,
  instructions: e.instructions ?? [],
  is_custom: false,
}));

const BATCH = 100;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/exercise_library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "apikey": SUPABASE_KEY,
      "Prefer": "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error(`Batch ${i / BATCH + 1} failed: ${r.status} ${txt}`);
  } else {
    inserted += batch.length;
    console.log(`Batch ${i / BATCH + 1}/${Math.ceil(rows.length / BATCH)} — ${inserted}/${rows.length}`);
  }
}
console.log("Done.");

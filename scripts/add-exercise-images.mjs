// Patches the images field onto existing exercise_library rows.
// Only updates the images column — all other fields are untouched.
// Run after sql/008_progress_photos.sql has been applied.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/add-exercise-images.mjs

const EXERCISES_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

console.log("Fetching exercises…");
const res = await fetch(EXERCISES_URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const raw = await res.json();

const withImages = raw.filter((e) => e.images && e.images.length > 0);
console.log(`${withImages.length} / ${raw.length} exercises have images`);

// Only include id + images — PostgREST merge-duplicates only updates
// the columns present in the payload, leaving everything else untouched.
const rows = withImages.map((e) => ({
  id: e.id.toLowerCase(),
  images: e.images,
}));

const BATCH = 100;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/exercise_library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error(`Batch ${Math.floor(i / BATCH) + 1} failed: ${r.status} ${txt}`);
  } else {
    done += batch.length;
    console.log(
      `Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)} — ${done}/${rows.length}`
    );
  }
}
console.log("Done.");

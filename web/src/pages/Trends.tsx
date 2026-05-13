import { useEffect, useRef, useState } from "react";
import Model, { type Muscle } from "react-body-highlighter";
import { supabase } from "../lib/supabase";
import { PlusIcon, TrashIcon, XIcon } from "../components/icons";

// ── Muscle recovery ────────────────────────────────────────────────────────────
const WORKOUT_MUSCLES: Record<string, string[]> = {
  chest: ["chest", "shoulders", "triceps"],
  back:  ["lats", "middle back", "lower back", "traps", "biceps"],
  legs:  ["quadriceps", "hamstrings", "glutes", "calves"],
  abs:   ["abdominals", "obliques"],
  run:   ["quadriceps", "hamstrings", "calves"],
};

const MUSCLE_TO_LIB: Record<string, string> = {
  chest:          "chest",
  shoulders:      "front-deltoids",
  triceps:        "triceps",
  biceps:         "biceps",
  forearms:       "forearm",
  abdominals:     "abs",
  obliques:       "obliques",
  traps:          "trapezius",
  lats:           "upper-back",
  "middle back":  "upper-back",
  "lower back":   "lower-back",
  quadriceps:     "quadriceps",
  hamstrings:     "hamstring",
  glutes:         "gluteal",
  calves:         "calves",
};

const RECOVERY_HOURS = 48;
const RECOVERY_COLORS = ["#dc2626", "#ea580c", "#d97706", "#65a30d", "#16a34a"];

type WorkoutRow = { date: string; workout_type: string };

function calcRecovery(workouts: WorkoutRow[]): Record<string, number> {
  const now = Date.now();
  const lastTrained: Record<string, number> = {};
  for (const w of workouts) {
    const muscles = WORKOUT_MUSCLES[w.workout_type] ?? [];
    const ts = new Date(`${w.date}T12:00:00`).getTime();
    for (const m of muscles) {
      if (!lastTrained[m] || ts > lastTrained[m]) lastTrained[m] = ts;
    }
  }
  const out: Record<string, number> = {};
  for (const [m, ts] of Object.entries(lastTrained)) {
    const h = (now - ts) / 3_600_000;
    out[m] = Math.min(1, h / RECOVERY_HOURS);
  }
  return out;
}

function buildModelData(recovery: Record<string, number>) {
  const buckets: string[][] = [[], [], [], [], []];
  for (const [muscle, pct] of Object.entries(recovery)) {
    const libName = MUSCLE_TO_LIB[muscle];
    if (!libName) continue;
    const bin = Math.min(4, Math.floor(pct * 5));
    for (let i = 0; i <= bin; i++) {
      if (!buckets[i].includes(libName)) buckets[i].push(libName);
    }
  }
  return buckets
    .map((muscles, i) => ({ name: `r${i}`, muscles: muscles as Muscle[] }))
    .filter((b) => b.muscles.length > 0);
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Trends() {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("workouts")
        .select("date, workout_type")
        .gte("date", since)
        .order("date", { ascending: false });
      setWorkouts((data as WorkoutRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const recovery = calcRecovery(workouts);

  return (
    <div className="pb-4 space-y-4">
      <WeeklySummary />
      <MuscleRecovery recovery={recovery} loading={loading} />
      <BodyWeight />
      <ProgressPhotos />
    </div>
  );
}

// ── Weekly summary ────────────────────────────────────────────────────────────
function WeeklySummary() {
  type Stat = { workouts: number; sets: number; volume: number };
  const [thisWeek, setThisWeek] = useState<Stat>({ workouts: 0, sets: 0, volume: 0 });
  const [lastWeek, setLastWeek] = useState<Stat>({ workouts: 0, sets: 0, volume: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const oneWeekAgo = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const twoWeeksAgo = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, date")
        .gte("date", twoWeeksAgo);

      const ws = (workouts ?? []) as { id: string; date: string }[];
      const thisIds = new Set(ws.filter((w) => w.date >= oneWeekAgo).map((w) => w.id));
      const lastIds = new Set(ws.filter((w) => w.date < oneWeekAgo).map((w) => w.id));

      let sets: { workout_id: string; weight_kg: number | null; reps: number | null; skipped: boolean }[] = [];
      if (thisIds.size > 0 || lastIds.size > 0) {
        const { data } = await supabase
          .from("sets")
          .select("workout_id, weight_kg, reps, skipped")
          .in("workout_id", [...thisIds, ...lastIds]);
        sets = (data as typeof sets) ?? [];
      }

      const tw: Stat = { workouts: thisIds.size, sets: 0, volume: 0 };
      const lw: Stat = { workouts: lastIds.size, sets: 0, volume: 0 };
      for (const s of sets) {
        if (s.skipped) continue;
        const bucket = thisIds.has(s.workout_id) ? tw : lw;
        bucket.sets += 1;
        bucket.volume += (s.weight_kg ?? 0) * (s.reps ?? 0);
      }
      setThisWeek(tw);
      setLastWeek(lw);
      setLoading(false);
    })();
  }, []);

  if (loading)
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-28 animate-pulse" />;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">This week</h2>
      </div>
      <div className="grid grid-cols-3 divide-x divide-neutral-800">
        <StatCell label="Workouts" value={thisWeek.workouts.toString()} delta={thisWeek.workouts - lastWeek.workouts} prevExists={lastWeek.workouts > 0} />
        <StatCell label="Sets" value={thisWeek.sets.toString()} delta={thisWeek.sets - lastWeek.sets} prevExists={lastWeek.sets > 0} />
        <StatCell
          label="Volume"
          value={thisWeek.volume > 0 ? Math.round(thisWeek.volume).toLocaleString() : "0"}
          suffix="kg"
          delta={Math.round(thisWeek.volume - lastWeek.volume)}
          prevExists={lastWeek.volume > 0}
        />
      </div>
    </div>
  );
}

function StatCell({
  label, value, suffix, delta, prevExists,
}: { label: string; value: string; suffix?: string; delta: number; prevExists: boolean }) {
  const deltaColor = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-neutral-500";
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">{label}</p>
      <p className="text-lg font-semibold">
        {value}
        {suffix && <span className="text-xs text-neutral-500 ml-0.5">{suffix}</span>}
      </p>
      {prevExists && (
        <p className={`text-[10px] mt-0.5 ${deltaColor}`}>
          {delta > 0 ? "+" : ""}{delta.toLocaleString()}{suffix ? ` ${suffix}` : ""} vs last
        </p>
      )}
    </div>
  );
}

// ── Body weight ───────────────────────────────────────────────────────────────
type BodyWeightRow = { date: string; kg: number };

function BodyWeight() {
  const [rows, setRows] = useState<BodyWeightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("body_weights")
      .select("date, kg")
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: true });
    setRows((data as BodyWeightRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    const kg = parseFloat(input);
    if (!kg || kg <= 0 || saving) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("body_weights")
      .upsert({ date: today, kg }, { onConflict: "date" });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setInput("");
    await load();
  }

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const delta = latest && previous ? latest.kg - previous.kg : 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">Body weight</h2>
        {latest && (
          <span className="text-[10px] text-neutral-500">
            last: {new Date(latest.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex items-end gap-4">
        <div className="shrink-0">
          {latest ? (
            <>
              <p className="text-2xl font-semibold">
                {latest.kg}
                <span className="text-xs text-neutral-500 ml-1">kg</span>
              </p>
              {previous && (
                <p className={`text-[10px] mt-0.5 ${delta > 0 ? "text-rose-400" : delta < 0 ? "text-emerald-400" : "text-neutral-500"}`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} vs last
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">No entries yet</p>
          )}
        </div>

        {!loading && rows.length > 1 && (
          <div className="flex-1 min-w-0">
            <Sparkline rows={rows} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 pb-4">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Log today's weight"
          className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
        />
        <button
          onClick={save}
          disabled={!input.trim() || saving}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40"
        >
          {saving ? "…" : "Log"}
        </button>
      </div>
    </div>
  );
}

function Sparkline({ rows }: { rows: BodyWeightRow[] }) {
  const w = 200, h = 50, pad = 4;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const kgs = rows.map((r) => r.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const range = Math.max(max - min, 0.1);
  const points = rows.map((r, i) => {
    const x = pad + (i / Math.max(rows.length - 1, 1)) * innerW;
    const y = pad + (1 - (r.kg - min) / range) * innerH;
    return { x, y };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12">
      <path d={path} stroke="#a3a3a3" fill="none" strokeWidth="1.5" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="#e5e5e5" />
      )}
    </svg>
  );
}

// ── Muscle recovery card ──────────────────────────────────────────────────────
function MuscleRecovery({
  recovery,
  loading,
}: {
  recovery: Record<string, number>;
  loading: boolean;
}) {
  const [view, setView] = useState<"anterior" | "posterior">("anterior");
  const modelData = buildModelData(recovery);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <div>
          <h2 className="font-semibold text-sm">Muscle Recovery</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">24 h = 50% · 48 h = 100% recovered</p>
        </div>
        <div className="flex gap-1 bg-neutral-800 rounded-lg p-0.5">
          {(["anterior", "posterior"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === v ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-white"
              }`}
            >
              {v === "anterior" ? "Front" : "Back"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 flex justify-center">
        {loading ? (
          <div className="h-72 w-40 rounded-xl bg-neutral-800 animate-pulse" />
        ) : (
          <Model
            data={modelData}
            type={view}
            highlightedColors={RECOVERY_COLORS}
            bodyColor="#2a2a2a"
            style={{ width: "10rem" }}
          />
        )}
      </div>

      <div className="flex items-center gap-3 px-4 pb-3">
        <div className="h-2 flex-1 rounded-full" style={{
          background: "linear-gradient(to right, #dc2626, #ea580c, #d97706, #65a30d, #16a34a)"
        }} />
        <div className="flex justify-between w-full max-w-[200px] text-[10px] text-neutral-500">
          <span>Just trained</span>
          <span>Recovered</span>
        </div>
      </div>

      <MuscleList recovery={recovery} />
    </div>
  );
}

// ── Muscle list ───────────────────────────────────────────────────────────────
const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", abdominals: "Abs", obliques: "Obliques",
  traps: "Traps", lats: "Lats", "middle back": "Mid Back", "lower back": "Lower Back",
  glutes: "Glutes", quadriceps: "Quads", hamstrings: "Hamstrings", calves: "Calves",
};

function dotColor(pct: number) {
  return RECOVERY_COLORS[Math.min(4, Math.floor(pct * 5))];
}

function MuscleList({ recovery }: { recovery: Record<string, number> }) {
  const trained = Object.keys(MUSCLE_LABELS).filter((m) => recovery[m] !== undefined);
  if (trained.length === 0) return null;
  return (
    <div className="border-t border-neutral-800">
      <div className="grid grid-cols-2 divide-x divide-neutral-800">
        {trained.map((m) => {
          const pct = recovery[m]!;
          const hoursLeft = pct >= 1 ? null : Math.round((1 - pct) * RECOVERY_HOURS);
          return (
            <div key={m} className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor(pct) }} />
                <span className="text-xs text-neutral-300">{MUSCLE_LABELS[m]}</span>
              </div>
              <span className="text-[10px] text-neutral-500">
                {pct >= 1 ? "Ready" : `${hoursLeft}h left`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Progress photos ───────────────────────────────────────────────────────────
type Photo = {
  id: string;
  taken_at: string;
  storage_path: string;
  notes: string | null;
};

async function compressImage(file: File, maxPx = 1200): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(new File([blob!], "photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.82,
      );
    };
    img.src = url;
  });
}

function ProgressPhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchPhotos() {
    setLoading(true);
    const { data } = await supabase
      .from("progress_photos")
      .select("*")
      .order("taken_at", { ascending: false });
    const list = (data as Photo[]) ?? [];
    setPhotos(list);

    // Fetch signed URLs for all photos
    const map: Record<string, string> = {};
    await Promise.all(
      list.map(async (p) => {
        const { data: signed } = await supabase.storage
          .from("progress-photos")
          .createSignedUrl(p.storage_path, 3600);
        if (signed?.signedUrl) map[p.id] = signed.signedUrl;
      }),
    );
    setUrls(map);
    setLoading(false);
  }

  useEffect(() => { fetchPhotos(); }, []);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("progress-photos")
        .upload(path, compressed, { contentType: "image/jpeg" });
      if (upErr) { alert(upErr.message); return; }
      const { error: dbErr } = await supabase.from("progress_photos").insert({
        taken_at: new Date().toISOString().slice(0, 10),
        storage_path: path,
      });
      if (dbErr) { alert(dbErr.message); return; }
      await fetchPhotos();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(photo: Photo) {
    await supabase.storage.from("progress-photos").remove([photo.storage_path]);
    await supabase.from("progress_photos").delete().eq("id", photo.id);
    setLightbox(null);
    setConfirmDelete(false);
    await fetchPhotos();
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">Progress Photos</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
        >
          {uploading ? (
            <span className="text-neutral-500">Uploading…</span>
          ) : (
            <>
              <PlusIcon className="w-3.5 h-3.5" />
              Add photo
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-1 p-3">
          {[0,1,2].map((i) => (
            <div key={i} className="aspect-square rounded-xl bg-neutral-800 animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center gap-2 py-10 text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <PlusIcon className="w-6 h-6" />
          <span className="text-sm">Add your first progress photo</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-1 p-3">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setLightbox(p)}
              className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative"
            >
              {urls[p.id] ? (
                <img
                  src={urls[p.id]}
                  alt={p.taken_at}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-neutral-800" />
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-1">
                <span className="text-[9px] text-neutral-300">
                  {new Date(p.taken_at + "T12:00:00").toLocaleDateString("en-GB", {
                    day: "numeric", month: "short"
                  })}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => { setLightbox(null); setConfirmDelete(false); }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 shrink-0"
            onClick={(e) => e.stopPropagation()}>
            <span className="text-sm text-neutral-300">
              {new Date(lightbox.taken_at + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "short", day: "numeric", month: "long", year: "numeric"
              })}
            </span>
            <button onClick={() => { setLightbox(null); setConfirmDelete(false); }}
              className="p-2 text-neutral-400 hover:text-white">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {urls[lightbox.id] && (
              <img
                src={urls[lightbox.id]}
                alt="Progress"
                className="max-w-full max-h-full object-contain rounded-xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {/* Delete */}
          <div className="px-4 pb-safe pb-6 shrink-0" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-3 rounded-xl border border-neutral-700 text-sm text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deletePhoto(lightbox)}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-sm font-semibold text-white"
                >
                  Delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-900/60 text-red-400 text-sm font-medium"
              >
                <TrashIcon className="w-4 h-4" />
                Delete photo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

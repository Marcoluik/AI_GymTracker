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
      <MuscleRecovery recovery={recovery} loading={loading} />
      <ProgressPhotos />
    </div>
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

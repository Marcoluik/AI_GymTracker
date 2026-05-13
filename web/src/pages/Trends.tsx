import { useEffect, useState } from "react";
import Model, { type Muscle } from "react-body-highlighter";
import { supabase } from "../lib/supabase";

// ── Muscle mapping ─────────────────────────────────────────────────────────────
const WORKOUT_MUSCLES: Record<string, string[]> = {
  chest: ["chest", "shoulders", "triceps"],
  back:  ["lats", "middle back", "lower back", "traps", "biceps"],
  legs:  ["quadriceps", "hamstrings", "glutes", "calves"],
  abs:   ["abdominals", "obliques"],
  run:   ["quadriceps", "hamstrings", "calves"],
};

// Map internal muscle names → react-body-highlighter muscle names
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

// Recovery color scale: red (just trained) → green (fully recovered)
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

// Convert recovery map → react-body-highlighter data format.
// The library colours muscles by frequency (how many exercises hit them).
// We abuse this: bin 0–4 = recovery 0–100%, each bin adds the muscle to
// one more "fake exercise" so frequency = bin+1 → highlightedColors[bin].
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <div>
          <h2 className="font-semibold text-sm">Muscle Recovery</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            24 h = 50% · 48 h = 100% recovered
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-800 rounded-lg p-0.5">
          {(["anterior", "posterior"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === v
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-white"
              }`}
            >
              {v === "anterior" ? "Front" : "Back"}
            </button>
          ))}
        </div>
      </div>

      {/* Body model */}
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

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 pb-3">
        <div className="flex items-center gap-1.5 flex-1">
          <div
            className="h-2 flex-1 rounded-full"
            style={{
              background:
                "linear-gradient(to right, #dc2626, #ea580c, #d97706, #65a30d, #16a34a)",
            }}
          />
        </div>
        <div className="flex justify-between w-full max-w-[200px] text-[10px] text-neutral-500">
          <span>Just trained</span>
          <span>Recovered</span>
        </div>
      </div>

      {/* Muscle list */}
      <MuscleList recovery={recovery} />
    </div>
  );
}

// ── Muscle status list ────────────────────────────────────────────────────────
const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", abdominals: "Abs", obliques: "Obliques",
  traps: "Traps", lats: "Lats", "middle back": "Mid Back", "lower back": "Lower Back",
  glutes: "Glutes", quadriceps: "Quads", hamstrings: "Hamstrings", calves: "Calves",
};

function dotColor(pct: number): string {
  const bin = Math.min(4, Math.floor(pct * 5));
  return RECOVERY_COLORS[bin];
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
            <div
              key={m}
              className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor(pct) }}
                />
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

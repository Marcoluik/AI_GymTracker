import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronLeftIcon } from "../components/icons";

type SetRow = {
  weight_kg: number | null;
  reps: number | null;
  skipped: boolean;
  workout_id: string;
};

type WorkoutRow = {
  id: string;
  date: string;
  workout_type: string;
};

type Session = {
  workout_id: string;
  date: string;
  workout_type: string;
  sets: { weight: number; reps: number }[];
  maxWeight: number;
  bestE1RM: number;
  volume: number;
};

// Epley formula: w × (1 + r/30). Standard estimated 1-rep max.
function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function labelize(name: string) {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d: string): string {
  const date = new Date(`${d}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(today.getFullYear() === date.getFullYear() ? {} : { year: "numeric" }),
  });
}

const TYPE_DOT_BG: Record<string, string> = {
  chest: "bg-sky-500",
  back: "bg-violet-500",
  legs: "bg-emerald-500",
  abs: "bg-rose-500",
  run: "bg-orange-500",
};

export default function ExerciseDetail() {
  const { name } = useParams();
  const exerciseName = name ?? "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bodyWeights, setBodyWeights] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [libraryMatch, setLibraryMatch] = useState<{ name: string; primary_muscles: string[] } | null>(null);

  useEffect(() => {
    if (!exerciseName) return;
    (async () => {
      setLoading(true);
      const [{ data: setRows }, { data: libRow }, { data: bwRows }] = await Promise.all([
        supabase
          .from("sets")
          .select("weight_kg, reps, skipped, workout_id")
          .eq("exercise_name", exerciseName),
        supabase
          .from("exercise_library")
          .select("name, primary_muscles")
          .eq("id", exerciseName)
          .maybeSingle(),
        supabase.from("body_weights").select("date, kg"),
      ]);
      const bwMap = new Map<string, number>();
      for (const r of (bwRows ?? []) as { date: string; kg: number }[]) bwMap.set(r.date, r.kg);
      setBodyWeights(bwMap);
      setLibraryMatch(libRow as { name: string; primary_muscles: string[] } | null);

      const sets = (setRows ?? []) as SetRow[];
      if (sets.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
      const { data: workoutRows } = await supabase
        .from("workouts")
        .select("id, date, workout_type")
        .in("id", workoutIds);

      const workouts = new Map(
        ((workoutRows ?? []) as WorkoutRow[]).map((w) => [w.id, w]),
      );

      // Group sets by workout
      const byWorkout = new Map<string, SetRow[]>();
      for (const s of sets) {
        if (s.skipped) continue;
        const list = byWorkout.get(s.workout_id) ?? [];
        list.push(s);
        byWorkout.set(s.workout_id, list);
      }

      const built: Session[] = [];
      for (const [workout_id, srows] of byWorkout) {
        const w = workouts.get(workout_id);
        if (!w) continue;
        const clean = srows
          .filter((r) => r.weight_kg !== null && r.reps !== null && r.weight_kg > 0)
          .map((r) => ({ weight: r.weight_kg!, reps: r.reps! }));
        if (clean.length === 0) continue;
        const maxWeight = Math.max(...clean.map((s) => s.weight));
        const bestE1RM = Math.max(...clean.map((s) => e1rm(s.weight, s.reps)));
        const volume = clean.reduce((sum, s) => sum + s.weight * s.reps, 0);
        built.push({
          workout_id,
          date: w.date,
          workout_type: w.workout_type,
          sets: clean,
          maxWeight,
          bestE1RM,
          volume,
        });
      }
      built.sort((a, b) => a.date.localeCompare(b.date));
      setSessions(built);
      setLoading(false);
    })();
  }, [exerciseName]);

  // Compute all-time stats
  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const maxWeight = Math.max(...sessions.map((s) => s.maxWeight));
    const maxE1RM = Math.max(...sessions.map((s) => s.bestE1RM));
    const totalVolume = sessions.reduce((sum, s) => sum + s.volume, 0);
    return { maxWeight, maxE1RM, totalVolume, sessions: sessions.length };
  }, [sessions]);

  // Stalling detection: have any of the last N sessions hit a new e1RM PR?
  const stalling = useMemo(() => {
    if (sessions.length < 6) return null;
    const N = 5;
    const recent = sessions.slice(-N);
    const before = sessions.slice(0, -N);
    if (before.length === 0) return null;
    const priorMax = Math.max(...before.map((s) => s.bestE1RM));
    const recentMax = Math.max(...recent.map((s) => s.bestE1RM));
    return recentMax <= priorMax;
  }, [sessions]);

  if (loading)
    return (
      <div className="space-y-3">
        <div className="h-6 w-32 rounded bg-neutral-900 animate-pulse" />
        <div className="h-32 rounded-xl bg-neutral-900 animate-pulse" />
        <div className="h-48 rounded-xl bg-neutral-900 animate-pulse" />
      </div>
    );

  const displayName = libraryMatch?.name ?? labelize(exerciseName);

  return (
    <div className="pb-4 space-y-4">
      <button
        onClick={() => history.back()}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-white -ml-1"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        Back
      </button>

      <header>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
        {libraryMatch?.primary_muscles && libraryMatch.primary_muscles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {libraryMatch.primary_muscles.map((m) => (
              <span key={m} className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                {m}
              </span>
            ))}
          </div>
        )}
      </header>

      {!stats ? (
        <p className="text-sm text-neutral-500 py-6 text-center">
          No completed sets logged yet.
        </p>
      ) : (
        <>
          {/* All-time stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Max weight" value={`${stats.maxWeight} kg`} />
            <StatTile label="Best 1RM (est.)" value={`${Math.round(stats.maxE1RM)} kg`} />
            <StatTile label="Total volume" value={`${Math.round(stats.totalVolume).toLocaleString()} kg`} />
            <StatTile label="Sessions" value={`${stats.sessions}`} />
          </div>

          {stalling !== null && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              stalling
                ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            }`}>
              {stalling
                ? `Stalled — no new 1RM in the last ${Math.min(5, sessions.length)} sessions`
                : "Progressing — new 1RM within the last 5 sessions"}
            </div>
          )}

          {/* e1RM chart with optional BW overlay */}
          {sessions.length >= 2 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">1-rep max (estimated)</h2>
                <span className="text-[10px] text-neutral-500">
                  last {Math.min(sessions.length, 20)} sessions
                </span>
              </div>
              <E1RMChart sessions={sessions.slice(-20)} bodyWeights={bodyWeights} />
            </div>
          )}

          {/* Volume chart */}
          {sessions.length >= 2 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Volume per session</h2>
                <span className="text-[10px] text-neutral-500">total kg lifted</span>
              </div>
              <VolumeChart sessions={sessions.slice(-20)} />
            </div>
          )}

          {/* Sessions-per-week sparkline */}
          {sessions.length >= 3 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Frequency</h2>
                <span className="text-[10px] text-neutral-500">sessions per week</span>
              </div>
              <FrequencyChart sessions={sessions} />
            </div>
          )}

          {/* Session history */}
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 px-1 mb-2">
              History
            </h2>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              {[...sessions].reverse().slice(0, 30).map((s, i, arr) => (
                <Link
                  key={s.workout_id}
                  to={`/workouts/${s.workout_id}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors ${
                    i < arr.length - 1 ? "border-b border-neutral-800" : ""
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT_BG[s.workout_type] ?? "bg-neutral-600"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{formatDate(s.date)}</div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {s.sets.length} {s.sets.length === 1 ? "set" : "sets"} · max {s.maxWeight} kg · 1RM ~{Math.round(s.bestE1RM)} kg
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function E1RMChart({
  sessions,
  bodyWeights,
}: {
  sessions: Session[];
  bodyWeights: Map<string, number>;
}) {
  const w = 320, h = 120, pad = 12;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const values = sessions.map((s) => s.bestE1RM);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const points = sessions.map((s, i) => {
    const x = pad + (i / Math.max(sessions.length - 1, 1)) * innerW;
    const y = pad + (1 - (s.bestE1RM - min) / range) * innerH;
    return { x, y, value: s.bestE1RM };
  });

  let runMax = -Infinity;
  const isPR = points.map((p) => {
    const yes = p.value > runMax;
    if (yes) runMax = p.value;
    return yes;
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Optional BW overlay — only if we have BW data for ≥ 2 of these sessions
  const bwForSessions = sessions.map((s) => {
    // Find nearest BW entry within ±7 days
    const target = new Date(`${s.date}T12:00:00`).getTime();
    let best: number | null = null;
    let bestDiff = Infinity;
    for (const [date, kg] of bodyWeights) {
      const diff = Math.abs(new Date(`${date}T12:00:00`).getTime() - target);
      if (diff < bestDiff && diff <= 7 * 86_400_000) {
        bestDiff = diff;
        best = kg;
      }
    }
    return best;
  });
  const knownBW = bwForSessions.filter((v): v is number => v !== null);
  const showBW = knownBW.length >= 2;
  let bwPath = "";
  if (showBW) {
    const bwMin = Math.min(...knownBW);
    const bwMax = Math.max(...knownBW);
    const bwRange = Math.max(bwMax - bwMin, 1);
    const bwPts: { x: number; y: number }[] = [];
    sessions.forEach((_, i) => {
      const v = bwForSessions[i];
      if (v === null) return;
      const x = pad + (i / Math.max(sessions.length - 1, 1)) * innerW;
      const y = pad + (1 - (v - bwMin) / bwRange) * innerH;
      bwPts.push({ x, y });
    });
    bwPath = bwPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {showBW && (
          <path d={bwPath} stroke="#525252" fill="none" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
        )}
        <path d={path} stroke="#737373" fill="none" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isPR[i] ? 3.5 : 2.5}
            fill={isPR[i] ? "#22c55e" : "#a3a3a3"}
          />
        ))}
      </svg>
      <div className="flex justify-between items-center text-[10px] text-neutral-500 mt-1">
        <span>{Math.round(min)} kg</span>
        {showBW && (
          <span className="flex items-center gap-1 text-neutral-600">
            <span className="inline-block w-3 h-px border-t border-dashed border-neutral-500" />
            bodyweight
          </span>
        )}
        <span>{Math.round(max)} kg</span>
      </div>
    </div>
  );
}

function VolumeChart({ sessions }: { sessions: Session[] }) {
  const w = 320, h = 90, pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const values = sessions.map((s) => s.volume);
  const max = Math.max(...values, 1);
  const barW = innerW / Math.max(sessions.length, 1);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {sessions.map((s, i) => {
          const heightPct = s.volume / max;
          const barH = innerH * heightPct;
          return (
            <rect
              key={i}
              x={pad + i * barW + 1}
              y={pad + innerH - barH}
              width={Math.max(barW - 2, 1)}
              height={Math.max(barH, 1)}
              fill="#a3a3a3"
              rx="1"
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
        <span>0 kg</span>
        <span>{Math.round(max).toLocaleString()} kg</span>
      </div>
    </div>
  );
}

function FrequencyChart({ sessions }: { sessions: Session[] }) {
  // Group sessions into 12 weeks ending this week
  const WEEKS = 12;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7;
  const startOfThisWeek = new Date(today.getTime() - dayOfWeek * 86_400_000);
  const startDate = new Date(startOfThisWeek.getTime() - (WEEKS - 1) * 7 * 86_400_000);
  const counts = new Array(WEEKS).fill(0);
  for (const s of sessions) {
    const idx = Math.floor(
      (new Date(`${s.date}T12:00:00`).getTime() - startDate.getTime()) /
        (7 * 86_400_000),
    );
    if (idx >= 0 && idx < WEEKS) counts[idx] += 1;
  }
  const max = Math.max(...counts, 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-10">
        {counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-neutral-500"
            style={{
              height: `${(c / max) * 100}%`,
              minHeight: c > 0 ? "2px" : "0",
              opacity: c > 0 ? 1 : 0.2,
            }}
            title={`${c} session${c === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-neutral-600 mt-1">
        <span>12 wks ago</span>
        <span>this week</span>
      </div>
    </div>
  );
}

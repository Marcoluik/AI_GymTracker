import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Model, { type Muscle } from "react-body-highlighter";
import { supabase } from "../lib/supabase";
import { PlusIcon, TrashIcon, XIcon, ChevronDownIcon } from "../components/icons";

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
  return (
    <div className="pb-4 space-y-3">
      <WeeklySummary />
      <ProgramSuggestions />
      <Section title="Strength records" subtitle="Recent PRs, most improved, best weights">
        <RecentWeightPRs />
        <MostImproved />
        <PRDashboard />
      </Section>
      <Section title="Training volume" subtitle="Total kg lifted per week">
        <WeeklyVolume />
      </Section>
      <Section title="Running" subtitle="Distance, pace, weekly totals">
        <RunAnalytics />
      </Section>
      <Section title="Muscle recovery" subtitle="What's ready to train">
        <MuscleRecovery />
      </Section>
      <Section title="Body weight" subtitle="Log and track your weight">
        <BodyWeight />
      </Section>
      <Section title="Progress photos" subtitle="Visual check-ins">
        <ProgressPhotos />
      </Section>
    </div>
  );
}

// Collapsible section — content only loads when opened, so the page stays
// short and fast.
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  // Remember which sections you keep open between visits
  const [open, setOpen] = useState(
    () => localStorage.getItem(`trends-open:${title}`) === "1",
  );
  const toggle = () =>
    setOpen((v) => {
      localStorage.setItem(`trends-open:${title}`, v ? "0" : "1");
      return !v;
    });
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3.5 text-left hover:bg-neutral-800/40 active:bg-neutral-800/60 transition-colors"
      >
        <div className="min-w-0">
          <span className="font-semibold text-sm">{title}</span>
          {subtitle && <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-neutral-600 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="mt-3 space-y-3 page-fade">{children}</div>}
    </div>
  );
}

// ── Program suggestions ───────────────────────────────────────────────────────
// Compares the weights actually lifted in the last two sessions of each
// exercise against the program target — if they consistently differ (up or
// down), offers a one-tap program update.

type Suggestion = {
  programId: number;
  exercise: string;
  current: string | null;
  toKg: number;
};

const DISMISSED_KEY = "programSuggestionsDismissed";

function loadDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function suggestionKey(s: Suggestion): string {
  return `${s.programId}:${s.toKg}`;
}

// The weight that best represents a session: the most common working-set
// weight; ties go to the heavier one.
function dominantWeight(weights: number[]): number | null {
  if (weights.length === 0) return null;
  const counts = new Map<number, number>();
  for (const w of weights) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function ProgramSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: prog } = await supabase
        .from("program")
        .select("id, exercise_name, workout_type, default_weight_kg, per_set_weights");
      const programRows = ((prog ?? []) as {
        id: number;
        exercise_name: string;
        workout_type: string;
        default_weight_kg: number | null;
        per_set_weights: number[] | null;
      }[]).filter((p) => p.workout_type !== "run");
      if (programRows.length === 0) { setSuggestions([]); return; }

      const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
      const { data: sets } = await supabase
        .from("sets")
        .select("exercise_name, weight_kg, skipped, is_warmup, workouts!inner(date)")
        .in("exercise_name", programRows.map((p) => p.exercise_name))
        .eq("skipped", false)
        .not("weight_kg", "is", null)
        .gte("workouts.date", since);

      // exercise → date → working-set weights that day
      const byExercise = new Map<string, Map<string, number[]>>();
      for (const r of (sets ?? []) as {
        exercise_name: string;
        weight_kg: number;
        is_warmup?: boolean;
        workouts: { date: string } | { date: string }[];
      }[]) {
        if (r.is_warmup) continue;
        const date = Array.isArray(r.workouts) ? r.workouts[0]?.date : r.workouts?.date;
        if (!date) continue;
        const byDate = byExercise.get(r.exercise_name) ?? new Map<string, number[]>();
        const list = byDate.get(date) ?? [];
        list.push(r.weight_kg);
        byDate.set(date, list);
        byExercise.set(r.exercise_name, byDate);
      }

      const out: Suggestion[] = [];
      for (const p of programRows) {
        const byDate = byExercise.get(p.exercise_name);
        if (!byDate) continue;
        const lastTwo = [...byDate.keys()].sort().slice(-2);
        if (lastTwo.length < 2) continue;
        const [a, b] = lastTwo.map((d) => dominantWeight(byDate.get(d)!));
        if (a === null || a !== b || a <= 0) continue;

        const targets =
          p.per_set_weights && p.per_set_weights.length > 0
            ? p.per_set_weights
            : p.default_weight_kg !== null
              ? [p.default_weight_kg]
              : [];
        if (targets.length > 0 && targets.every((w) => w === a)) continue;

        out.push({
          programId: p.id,
          exercise: p.exercise_name,
          current:
            targets.length > 0 ? [...new Set(targets)].map(formatKg).join(" / ") : null,
          toKg: a,
        });
      }
      setSuggestions(out.slice(0, 6));
    })();
  }, []);

  async function apply(s: Suggestion) {
    setBusy(s.programId);
    const { error } = await supabase
      .from("program")
      .update({ default_weight_kg: s.toKg, per_set_weights: null })
      .eq("id", s.programId);
    setBusy(null);
    if (error) { alert(error.message); return; }
    setSuggestions((prev) => prev?.filter((x) => x.programId !== s.programId) ?? null);
  }

  function dismiss(s: Suggestion) {
    const next = [...dismissed, suggestionKey(s)].slice(-50);
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  }

  const visible = (suggestions ?? []).filter((s) => !dismissed.includes(suggestionKey(s)));
  if (visible.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">Update your program?</h2>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          based on what you actually lifted in your last two sessions
        </p>
      </div>
      <div>
        {visible.map((s, i) => (
          <div
            key={suggestionKey(s)}
            className={`flex items-center gap-3 px-4 py-3 ${
              i < visible.length - 1 ? "border-b border-neutral-800" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{labelizeName(s.exercise)}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                lifted {formatKg(s.toKg)} kg both times
                {s.current ? ` · program says ${s.current} kg` : " · no program weight set"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => apply(s)}
              disabled={busy === s.programId}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              {busy === s.programId ? "…" : `Set ${formatKg(s.toKg)} kg`}
            </button>
            <button
              type="button"
              onClick={() => dismiss(s)}
              aria-label="Dismiss suggestion"
              className="shrink-0 p-1.5 text-neutral-600 hover:text-neutral-300"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent real PRs ───────────────────────────────────────────────────────────

type RecentPR = {
  exercise_name: string;
  date: string;
  weight: number;
  reps: number | null;
  previous: number;
};

function RecentWeightPRs() {
  const [items, setItems] = useState<RecentPR[] | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("sets")
        .select("exercise_name, weight_kg, reps, skipped, is_warmup, workouts!inner(date)")
        .eq("skipped", false)
        .not("weight_kg", "is", null)
        .gt("weight_kg", 0);

      const rows = (data ?? []) as {
        exercise_name: string;
        weight_kg: number;
        reps: number | null;
        skipped: boolean;
        is_warmup?: boolean;
        workouts: { date: string } | { date: string }[];
      }[];

      const byExercise = new Map<string, Map<string, { weight: number; reps: number | null }>>();
      for (const r of rows) {
        if (r.is_warmup) continue;
        const date = Array.isArray(r.workouts) ? r.workouts[0]?.date : r.workouts?.date;
        if (!date) continue;
        const byDate = byExercise.get(r.exercise_name) ?? new Map<string, { weight: number; reps: number | null }>();
        const current = byDate.get(date);
        if (!current || r.weight_kg > current.weight || (r.weight_kg === current.weight && (r.reps ?? 0) > (current.reps ?? 0))) {
          byDate.set(date, { weight: r.weight_kg, reps: r.reps ?? null });
        }
        byExercise.set(r.exercise_name, byDate);
      }

      const prs: RecentPR[] = [];
      for (const [exercise_name, byDate] of byExercise) {
        let best = 0;
        const ordered = [...byDate.entries()]
          .map(([date, row]) => ({ date, ...row }))
          .sort((a, b) => a.date.localeCompare(b.date));
        for (const row of ordered) {
          if (row.weight > best) {
            if (best > 0 && row.date >= since) {
              prs.push({
                exercise_name,
                date: row.date,
                weight: row.weight,
                reps: row.reps,
                previous: best,
              });
            }
            best = row.weight;
          }
        }
      }

      setItems(
        prs
          .sort((a, b) => b.date.localeCompare(a.date) || (b.weight - b.previous) - (a.weight - a.previous))
          .slice(0, 5),
      );
    })();
  }, []);

  if (items === null) {
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-28 animate-pulse" />;
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <div>
          <h2 className="font-semibold text-sm">Recent weight PRs</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">actual heaviest set, last 90 days</p>
        </div>
        <span className="text-[10px] text-neutral-500">{items.length}</span>
      </div>
      <div>
        {items.map((p, i) => (
          <Link
            key={`${p.exercise_name}-${p.date}-${p.weight}`}
            to={`/exercise/${encodeURIComponent(p.exercise_name)}`}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/40 transition-colors ${
              i < items.length - 1 ? "border-b border-neutral-800" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{labelizeName(p.exercise_name)}</div>
              <div className="text-[10px] text-neutral-500">
                {formatDateShort(p.date)} · {p.reps ? `${p.reps} reps` : "logged set"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-emerald-400">
                {formatKg(p.weight)} kg
              </div>
              <div className="text-[10px] text-neutral-500">
                +{formatKg(p.weight - p.previous)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Most improved this month ──────────────────────────────────────────────────

function MostImproved() {
  const [items, setItems] = useState<{ name: string; current: number; delta: number }[] | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);

      // Pull workouts from last 2 months
      const { data: ws } = await supabase
        .from("workouts")
        .select("id, date")
        .gte("date", lastMonthStart);
      const wmap = new Map(((ws ?? []) as { id: string; date: string }[]).map((w) => [w.id, w.date]));
      const ids = [...wmap.keys()];
      if (ids.length === 0) { setItems([]); return; }

      const { data: sets } = await supabase
        .from("sets")
        .select("*")
        .in("workout_id", ids)
        .eq("skipped", false)
        .not("weight_kg", "is", null)
        .gt("weight_kg", 0);
      const rows = (sets ?? []) as {
        exercise_name: string;
        weight_kg: number;
        reps: number | null;
        skipped: boolean;
        workout_id: string;
        is_warmup?: boolean;
      }[];

      // Group: exercise -> { thisMax, lastMax } heaviest logged working set in each window
      const stats = new Map<string, { thisMax: number; lastMax: number }>();
      for (const r of rows) {
        if (r.is_warmup) continue;
        const date = wmap.get(r.workout_id);
        if (!date) continue;
        const cur = stats.get(r.exercise_name) ?? { thisMax: 0, lastMax: 0 };
        if (date >= thisMonthStart) {
          if (r.weight_kg > cur.thisMax) cur.thisMax = r.weight_kg;
        } else {
          if (r.weight_kg > cur.lastMax) cur.lastMax = r.weight_kg;
        }
        stats.set(r.exercise_name, cur);
      }

      const improvements = [...stats.entries()]
        .filter(([, s]) => s.thisMax > 0 && s.lastMax > 0 && s.thisMax > s.lastMax)
        .map(([name, s]) => ({ name, current: s.thisMax, delta: s.thisMax - s.lastMax }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);

      setItems(improvements);
    })();
  }, []);

  if (items === null || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">Most improved this month</h2>
        <p className="text-[11px] text-neutral-500 mt-0.5">based on logged max weight</p>
      </div>
      <div>
        {items.map((p, i) => (
          <Link
            key={p.name}
            to={`/exercise/${encodeURIComponent(p.name)}`}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/40 transition-colors ${
              i < items.length - 1 ? "border-b border-neutral-800" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{labelizeName(p.name)}</div>
              <div className="text-[10px] text-neutral-500">now {formatKg(p.current)} kg max</div>
            </div>
            <span className="text-sm font-semibold text-emerald-400">
              +{formatKg(p.delta)} <span className="text-[10px] text-neutral-500">kg</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── PR dashboard ──────────────────────────────────────────────────────────────

function labelizeName(name: string): string {
  const clean = name.replace(/_custom_\d+$/, "");
  const s = clean.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatDateShort(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type PR = { exercise_name: string; weight: number; reps: number | null };

function PRDashboard() {
  const [prs, setPrs] = useState<PR[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sets")
        .select("*")
        .eq("skipped", false)
        .not("weight_kg", "is", null)
        .gt("weight_kg", 0);
      const rows = (data ?? []) as {
        exercise_name: string;
        weight_kg: number;
        reps: number | null;
        skipped: boolean;
        is_warmup?: boolean;
      }[];

      const byExercise = new Map<string, PR>();
      for (const r of rows) {
        if (r.is_warmup) continue;
        const cur = byExercise.get(r.exercise_name);
        const reps = r.reps ?? null;
        if (
          !cur ||
          r.weight_kg > cur.weight ||
          (r.weight_kg === cur.weight && (reps ?? 0) > (cur.reps ?? 0))
        ) {
          byExercise.set(r.exercise_name, {
            exercise_name: r.exercise_name,
            weight: r.weight_kg,
            reps,
          });
        }
      }
      const sorted = [...byExercise.values()].sort(
        (a, b) => b.weight - a.weight || (b.reps ?? 0) - (a.reps ?? 0),
      );
      setPrs(sorted);
    })();
  }, []);

  if (prs === null)
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-32 animate-pulse" />;
  if (prs.length === 0) return null;

  const top = prs.slice(0, 8);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">Best logged weights</h2>
        <span className="text-[10px] text-neutral-500">heaviest set</span>
      </div>
      <div>
        {top.map((p, i) => (
          <Link
            key={p.exercise_name}
            to={`/exercise/${encodeURIComponent(p.exercise_name)}`}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/40 transition-colors ${
              i < top.length - 1 ? "border-b border-neutral-800" : ""
            }`}
          >
            <span className="w-5 text-[11px] text-neutral-600 font-mono shrink-0">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{labelizeName(p.exercise_name)}</div>
              <div className="text-[10px] text-neutral-500">
                {p.reps ? `for ${p.reps} reps` : "logged set"}
              </div>
            </div>
            <span className="text-sm font-semibold text-emerald-400 shrink-0">
              {formatKg(p.weight)} <span className="text-[10px] text-neutral-500">kg</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Run analytics ─────────────────────────────────────────────────────────────

type RunRow = {
  duration_minutes: number | null;
  distance_km: number | null;
  workout_id: string;
};

function RunAnalytics() {
  const [data, setData] = useState<{
    weeks: { weekStart: string; distance: number }[];
    longest: number;
    fastestPace: number | null;
    thisMonth: number;
    totalRuns: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const WEEKS = 12;
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const dayOfWeek = (today.getDay() + 6) % 7;
      const startOfThisWeek = new Date(today.getTime() - dayOfWeek * 86_400_000);
      const startDate = new Date(startOfThisWeek.getTime() - (WEEKS - 1) * 7 * 86_400_000);
      const startStr = startDate.toISOString().slice(0, 10);

      const { data: ws } = await supabase
        .from("workouts")
        .select("id, date")
        .eq("workout_type", "run")
        .gte("date", startStr);
      const wlist = (ws ?? []) as { id: string; date: string }[];

      // Pull all runs (not just this 12-week window) for "longest" / "totalRuns"
      const { data: allRuns } = await supabase
        .from("runs")
        .select("duration_minutes, distance_km, workout_id");
      const runs = (allRuns ?? []) as RunRow[];

      const runById = new Map(runs.map((r) => [r.workout_id, r]));

      // Initialise buckets
      const buckets: { weekStart: string; distance: number }[] = [];
      for (let i = 0; i < WEEKS; i++) {
        buckets.push({
          weekStart: new Date(startDate.getTime() + i * 7 * 86_400_000)
            .toISOString()
            .slice(0, 10),
          distance: 0,
        });
      }
      for (const w of wlist) {
        const r = runById.get(w.id);
        if (!r?.distance_km) continue;
        const idx = Math.floor(
          (new Date(`${w.date}T12:00:00`).getTime() - startDate.getTime()) /
            (7 * 86_400_000),
        );
        if (idx >= 0 && idx < WEEKS) buckets[idx].distance += r.distance_km;
      }

      let longest = 0;
      let fastestPace: number | null = null;
      for (const r of runs) {
        if (r.distance_km && r.distance_km > longest) longest = r.distance_km;
        if (r.distance_km && r.duration_minutes && r.distance_km > 0) {
          const pace = r.duration_minutes / r.distance_km;
          if (fastestPace === null || pace < fastestPace) fastestPace = pace;
        }
      }

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      let thisMonth = 0;
      for (const w of wlist) {
        if (w.date >= monthStart) {
          const r = runById.get(w.id);
          if (r?.distance_km) thisMonth += r.distance_km;
        }
      }

      setData({
        weeks: buckets,
        longest,
        fastestPace,
        thisMonth,
        totalRuns: runs.length,
      });
    })();
  }, []);

  if (!data) return null;
  if (data.totalRuns === 0)
    return (
      <p className="text-sm text-neutral-500 px-1 py-2 text-center">No runs logged yet.</p>
    );

  const maxWeek = Math.max(...data.weeks.map((w) => w.distance), 1);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <div>
          <h2 className="font-semibold text-sm">Runs</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">last 12 weeks</p>
        </div>
        <span className="text-[10px] text-neutral-500">{data.totalRuns} total</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-neutral-800 border-b border-neutral-800">
        <RunStat label="This month" value={`${data.thisMonth.toFixed(1)} km`} />
        <RunStat label="Longest" value={`${data.longest.toFixed(1)} km`} />
        <RunStat
          label="Best pace"
          value={
            data.fastestPace !== null
              ? `${Math.floor(data.fastestPace)}:${String(
                  Math.round((data.fastestPace - Math.floor(data.fastestPace)) * 60),
                ).padStart(2, "0")}/km`
              : "—"
          }
        />
      </div>

      <div className="px-3 py-4">
        <div className="flex items-end gap-1.5 h-20">
          {data.weeks.map((w) => {
            const heightPct = (w.distance / maxWeek) * 100;
            return (
              <div
                key={w.weekStart}
                className="flex-1 flex flex-col-reverse h-full"
                title={`Week of ${w.weekStart}: ${w.distance.toFixed(1)} km`}
              >
                <div
                  className="w-full rounded-sm bg-orange-500"
                  style={{
                    height: `${heightPct}%`,
                    minHeight: w.distance > 0 ? "2px" : "0",
                  }}
                />
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-neutral-600 mt-2 text-center">weekly distance</p>
      </div>
    </div>
  );
}

function RunStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

// ── Weekly volume per workout type ────────────────────────────────────────────

type WeekBucket = { weekStart: string; byType: Record<string, number> };

const TYPE_BAR_BG: Record<string, string> = {
  chest: "#0ea5e9",
  back: "#8b5cf6",
  legs: "#10b981",
  abs: "#f43f5e",
  run: "#f97316",
};

function WeeklyVolume() {
  const [weeks, setWeeks] = useState<WeekBucket[] | null>(null);

  useEffect(() => {
    (async () => {
      const WEEKS = 12;
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Monday
      const startOfThisWeek = new Date(today.getTime() - dayOfWeek * 86_400_000);
      const startDate = new Date(startOfThisWeek.getTime() - (WEEKS - 1) * 7 * 86_400_000);
      const startStr = startDate.toISOString().slice(0, 10);

      const { data: ws } = await supabase
        .from("workouts")
        .select("id, date, workout_type")
        .gte("date", startStr);

      const workoutMap = new Map(
        ((ws ?? []) as { id: string; date: string; workout_type: string }[]).map((w) => [w.id, w]),
      );
      const ids = [...workoutMap.keys()];

      let sets: {
        workout_id: string;
        weight_kg: number | null;
        reps: number | null;
        skipped: boolean;
        is_warmup?: boolean;
      }[] = [];
      if (ids.length > 0) {
        const { data } = await supabase
          .from("sets")
          .select("*")
          .in("workout_id", ids);
        sets = (data as typeof sets) ?? [];
      }

      // Initialise empty week buckets
      const buckets: WeekBucket[] = [];
      for (let i = 0; i < WEEKS; i++) {
        const ws = new Date(startDate.getTime() + i * 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        buckets.push({ weekStart: ws, byType: {} });
      }

      // For each set, find its week + workout type, add volume
      for (const s of sets) {
        if (s.skipped || s.is_warmup) continue;
        const w = workoutMap.get(s.workout_id);
        if (!w) continue;
        const wDate = new Date(`${w.date}T12:00:00`);
        const weeksFromStart = Math.floor((wDate.getTime() - startDate.getTime()) / (7 * 86_400_000));
        if (weeksFromStart < 0 || weeksFromStart >= WEEKS) continue;
        const bucket = buckets[weeksFromStart];
        const vol = (s.weight_kg ?? 0) * (s.reps ?? 0);
        bucket.byType[w.workout_type] = (bucket.byType[w.workout_type] ?? 0) + vol;
      }
      setWeeks(buckets);
    })();
  }, []);

  if (!weeks)
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-44 animate-pulse" />;

  const totals = weeks.map((w) =>
    Object.values(w.byType).reduce((sum, v) => sum + v, 0),
  );
  const max = Math.max(...totals, 1);
  const typesPresent = [...new Set(weeks.flatMap((w) => Object.keys(w.byType)))];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <div>
          <h2 className="font-semibold text-sm">Weekly volume</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">total kg lifted · last 12 weeks</p>
        </div>
        <div className="flex items-center gap-2">
          {typesPresent.map((t) => (
            <span key={t} className="flex items-center gap-1 text-[9px] text-neutral-500">
              <span className="w-2 h-2 rounded-sm" style={{ background: TYPE_BAR_BG[t] ?? "#525252" }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="px-3 py-4">
        <div className="flex items-end gap-1.5 h-32">
          {weeks.map((w, i) => {
            const total = totals[i];
            const heightPct = (total / max) * 100;
            // Sort segments by type for stable stacking
            const segs = Object.entries(w.byType).sort(([a], [b]) => a.localeCompare(b));
            return (
              <div key={w.weekStart} className="flex-1 flex flex-col-reverse items-center min-w-0 h-full" title={`Week of ${w.weekStart}: ${Math.round(total).toLocaleString()} kg`}>
                <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: `${heightPct}%`, minHeight: total > 0 ? "2px" : "0" }}>
                  {segs.map(([type, vol]) => (
                    <div
                      key={type}
                      style={{
                        height: `${(vol / total) * 100}%`,
                        background: TYPE_BAR_BG[type] ?? "#525252",
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-neutral-600 mt-2 px-0.5">
          <span>12 wks ago</span>
          <span>this week</span>
        </div>
      </div>
    </div>
  );
}

// ── Weekly summary ────────────────────────────────────────────────────────────
function WeeklySummary() {
  type Stat = { workouts: number; sets: number; volume: number };
  const [thisWeek, setThisWeek] = useState<Stat>({ workouts: 0, sets: 0, volume: 0 });
  const [lastWeek, setLastWeek] = useState<Stat>({ workouts: 0, sets: 0, volume: 0 });
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const oneWeekAgo = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const twoWeeksAgo = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

      // Pull the last 26 weeks of workout dates for streak calc
      const sixMonthsAgo = new Date(today.getTime() - 26 * 7 * 86_400_000).toISOString().slice(0, 10);

      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, date")
        .gte("date", sixMonthsAgo);

      const ws = (workouts ?? []) as { id: string; date: string }[];
      const thisIds = new Set(ws.filter((w) => w.date >= oneWeekAgo).map((w) => w.id));
      const lastIds = new Set(
        ws.filter((w) => w.date >= twoWeeksAgo && w.date < oneWeekAgo).map((w) => w.id),
      );

      // Compute consecutive-weeks streak ending this week
      const datesByWeek = new Set<string>();
      for (const w of ws) {
        const d = new Date(`${w.date}T12:00:00`);
        const dow = (d.getDay() + 6) % 7;
        const monday = new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
        datesByWeek.add(monday);
      }
      const todayD = new Date(today);
      todayD.setHours(12, 0, 0, 0);
      const todayDow = (todayD.getDay() + 6) % 7;
      let cursor = new Date(todayD.getTime() - todayDow * 86_400_000);
      let count = 0;
      while (true) {
        const key = cursor.toISOString().slice(0, 10);
        if (!datesByWeek.has(key)) break;
        count += 1;
        cursor = new Date(cursor.getTime() - 7 * 86_400_000);
      }
      setStreak(count);

      let sets: {
        workout_id: string;
        weight_kg: number | null;
        reps: number | null;
        skipped: boolean;
        is_warmup?: boolean;
      }[] = [];
      if (thisIds.size > 0 || lastIds.size > 0) {
        const { data } = await supabase
          .from("sets")
          .select("*")
          .in("workout_id", [...thisIds, ...lastIds]);
        sets = (data as typeof sets) ?? [];
      }

      const tw: Stat = { workouts: thisIds.size, sets: 0, volume: 0 };
      const lw: Stat = { workouts: lastIds.size, sets: 0, volume: 0 };
      for (const s of sets) {
        if (s.skipped || s.is_warmup) continue;
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
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-neutral-800">
        <h2 className="font-semibold text-sm">This week</h2>
        {streak > 1 && (
          <span className="text-[11px] font-semibold text-orange-300">
            {streak}-week streak
          </span>
        )}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
              save();
            }
          }}
          enterKeyHint="done"
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
function MuscleRecovery() {
  const [view, setView] = useState<"anterior" | "posterior">("anterior");
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("workouts")
        .select("date, workout_type")
        .gte("date", since)
        .order("date", { ascending: false });
      if (cancelled) return;
      setWorkouts((data as WorkoutRow[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const recovery = calcRecovery(workouts);
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("Image took too long to load"));
    }, 15_000);
    img.onload = () => {
      clearTimeout(timeout);
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
          if (!blob) { reject(new Error("Failed to encode image")); return; }
          resolve(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file"));
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
      let compressed: File;
      try {
        compressed = await compressImage(file);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not process image");
        return;
      }
      const path = `${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("progress-photos")
        .upload(path, compressed, { contentType: "image/jpeg" });
      if (upErr) { alert(upErr.message); return; }
      const { error: dbErr } = await supabase.from("progress_photos").insert({
        taken_at: new Date().toISOString().slice(0, 10),
        storage_path: path,
      });
      if (dbErr) {
        // Clean up orphan storage object if DB insert failed
        await supabase.storage.from("progress-photos").remove([path]);
        alert(dbErr.message);
        return;
      }
      await fetchPhotos();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(photo: Photo) {
    const { error: dbErr } = await supabase.from("progress_photos").delete().eq("id", photo.id);
    if (dbErr) { alert(dbErr.message); return; }
    // Best-effort storage cleanup — DB delete already succeeded, so a failed
    // storage remove just leaves an orphan we can clean up later.
    await supabase.storage.from("progress-photos").remove([photo.storage_path]);
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

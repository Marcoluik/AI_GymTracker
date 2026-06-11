import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronRightIcon, CalendarIcon, SearchIcon } from "../components/icons";

type Workout = {
  id: string;
  date: string;
  workout_type: string;
  notes: string | null;
  raw_message: string | null;
  created_at: string;
  session_id: string | null;
};

type WorkoutMetric = {
  sets: number;
  volume: number;
  distanceKm: number | null;
  durationMinutes: number | null;
};

const TYPE_STYLES: Record<string, string> = {
  chest: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  back: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  legs: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  abs: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  run: "bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30",
};

const TYPE_DOT_BG: Record<string, string> = {
  chest: "bg-sky-500",
  back: "bg-violet-500",
  legs: "bg-emerald-500",
  abs: "bg-rose-500",
  run: "bg-orange-500",
};

function formatRowDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(today.getFullYear() === d.getFullYear() ? {} : { year: "numeric" }),
  });
}

function groupKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function compactNumber(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(Math.round(value));
}

function metricText(w: Workout, metric?: WorkoutMetric): string | null {
  if (!metric) return null;
  if (w.workout_type === "run") {
    const parts: string[] = [];
    if (metric.distanceKm) parts.push(`${metric.distanceKm.toFixed(1)} km`);
    if (metric.durationMinutes) parts.push(`${metric.durationMinutes} min`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  const parts: string[] = [];
  if (metric.sets > 0) parts.push(`${metric.sets} ${metric.sets === 1 ? "set" : "sets"}`);
  if (metric.volume > 0) parts.push(`${compactNumber(metric.volume)} kg`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function aggregateMetrics(ids: string[], metrics: Record<string, WorkoutMetric>): WorkoutMetric | undefined {
  const found = ids.map((id) => metrics[id]).filter((m): m is WorkoutMetric => !!m);
  if (found.length === 0) return undefined;
  return found.reduce<WorkoutMetric>(
    (sum, m) => ({
      sets: sum.sets + m.sets,
      volume: sum.volume + m.volume,
      distanceKm: (sum.distanceKm ?? 0) + (m.distanceKm ?? 0) || null,
      durationMinutes: (sum.durationMinutes ?? 0) + (m.durationMinutes ?? 0) || null,
    }),
    { sets: 0, volume: 0, distanceKm: null, durationMinutes: null },
  );
}

// A "session" is either a single workout or 2 workouts sharing a session_id.
type Session =
  | { kind: "single"; workout: Workout }
  | { kind: "pair"; main: Workout; abs: Workout };

function buildSessions(workouts: Workout[]): Session[] {
  const seen = new Set<string>();
  const sessions: Session[] = [];
  for (const w of workouts) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    if (w.session_id) {
      const partner = workouts.find(
        (x) => x.session_id === w.session_id && x.id !== w.id,
      );
      if (partner) {
        seen.add(partner.id);
        // main = non-abs, abs = abs
        const main = w.workout_type === "abs" ? partner : w;
        const abs = w.workout_type === "abs" ? w : partner;
        sessions.push({ kind: "pair", main, abs });
        continue;
      }
    }
    sessions.push({ kind: "single", workout: w });
  }
  return sessions;
}

function TypePill({ type }: { type: string }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
        TYPE_STYLES[type] ?? "bg-neutral-800 text-neutral-400 ring-1 ring-inset ring-neutral-700"
      }`}
    >
      {type}
    </span>
  );
}

const PAGE_SIZE = 100;

export default function Workouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [metrics, setMetrics] = useState<Record<string, WorkoutMetric>>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("workouts")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);
      if (debouncedSearch) {
        // Match notes, raw_message, or workout_type
        q = q.or(
          `notes.ilike.%${debouncedSearch}%,raw_message.ilike.%${debouncedSearch}%,workout_type.ilike.%${debouncedSearch}%`,
        );
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        setWorkouts(data || []);
        setHasMore((data?.length ?? 0) === PAGE_SIZE);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  useEffect(() => {
    if (workouts.length === 0) {
      setMetrics({});
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = workouts.map((w) => w.id);
      const [{ data: sets }, { data: runs }] = await Promise.all([
        supabase
          .from("sets")
          .select("*")
          .in("workout_id", ids),
        supabase
          .from("runs")
          .select("workout_id, distance_km, duration_minutes")
          .in("workout_id", ids),
      ]);
      if (cancelled) return;

      const next: Record<string, WorkoutMetric> = {};
      for (const id of ids) {
        next[id] = { sets: 0, volume: 0, distanceKm: null, durationMinutes: null };
      }
      for (const s of (sets ?? []) as {
        workout_id: string;
        weight_kg: number | null;
        reps: number | null;
        skipped: boolean;
        is_warmup?: boolean;
      }[]) {
        if (s.skipped || s.is_warmup) continue;
        const metric = next[s.workout_id];
        if (!metric) continue;
        metric.sets += 1;
        metric.volume += (s.weight_kg ?? 0) * (s.reps ?? 0);
      }
      for (const r of (runs ?? []) as {
        workout_id: string;
        distance_km: number | null;
        duration_minutes: number | null;
      }[]) {
        const metric = next[r.workout_id];
        if (!metric) continue;
        metric.distanceKm = r.distance_km;
        metric.durationMinutes = r.duration_minutes;
      }
      setMetrics(next);
    })();
    return () => { cancelled = true; };
  }, [workouts]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    let q = supabase
      .from("workouts")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(workouts.length, workouts.length + PAGE_SIZE - 1);
    if (debouncedSearch) {
      q = q.or(
        `notes.ilike.%${debouncedSearch}%,raw_message.ilike.%${debouncedSearch}%,workout_type.ilike.%${debouncedSearch}%`,
      );
    }
    const { data } = await q;
    if (data) {
      setWorkouts((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  const searchBar = (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search workouts…"
        enterKeyHint="search"
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-600"
      />
    </div>
  );

  if (loading)
    return (
      <div className="space-y-4 pb-4">
        {searchBar}
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-neutral-900/60 border border-neutral-900 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (workouts.length === 0 && !debouncedSearch) return <EmptyState />;

  const sessions = buildSessions(workouts);

  const groups: { key: string; sessions: Session[] }[] = [];
  for (const s of sessions) {
    const date = s.kind === "single" ? s.workout.date : s.main.date;
    const k = groupKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.sessions.push(s);
    else groups.push({ key: k, sessions: [s] });
  }

  return (
    <div className="pb-4 space-y-6">
      {searchBar}
      {!debouncedSearch && <CalendarHeatmap workouts={workouts} />}
      {workouts.length === 0 && debouncedSearch && (
        <p className="text-center text-sm text-neutral-500 py-10">
          No workouts match "{debouncedSearch}".
        </p>
      )}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 px-1 mb-2">
            {g.key}
          </h2>
          <div className="space-y-2">
            {g.sessions.map((s) =>
              s.kind === "single" ? (
                <SingleRow key={s.workout.id} w={s.workout} metric={metrics[s.workout.id]} />
              ) : (
                <PairRow key={s.main.id} main={s.main} abs={s.abs} metrics={metrics} />
              ),
            )}
          </div>
        </section>
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl border border-neutral-800 bg-neutral-900 text-sm text-neutral-300 hover:bg-neutral-800/60 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load older workouts"}
        </button>
      )}
    </div>
  );
}

function SingleRow({ w, metric }: { w: Workout; metric?: WorkoutMetric }) {
  const summary = metricText(w, metric);
  return (
    <Link
      to={`/workouts/${w.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 active:bg-neutral-800 active:scale-[0.98] transition-[background-color,border-color,transform] duration-150"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <TypePill type={w.workout_type} />
          <span className="text-xs text-neutral-500">{formatRowDate(w.date)}</span>
        </div>
        {(w.notes || w.raw_message) && (
          <p className="text-sm text-neutral-400 truncate">
            {w.notes || w.raw_message}
          </p>
        )}
        {summary && (
          <p className="text-[11px] text-neutral-500 truncate mt-0.5">
            {summary}
          </p>
        )}
      </div>
      <ChevronRightIcon className="w-4 h-4 text-neutral-600 shrink-0" />
    </Link>
  );
}

function PairRow({
  main,
  abs,
  metrics,
}: {
  main: Workout;
  abs: Workout;
  metrics: Record<string, WorkoutMetric>;
}) {
  const aggregate = aggregateMetrics([main.id, abs.id], metrics);
  const summary = metricText(main, aggregate);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden active:scale-[0.98] transition-transform duration-150">
      <Link
        to={`/workouts/${main.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/50 active:bg-neutral-800 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <TypePill type={main.workout_type} />
            <TypePill type="abs" />
            <span className="text-xs text-neutral-500">{formatRowDate(main.date)}</span>
          </div>
          {(main.notes || main.raw_message) && (
            <p className="text-sm text-neutral-400 truncate">
              {main.notes || main.raw_message}
            </p>
          )}
          {summary && (
            <p className="text-[11px] text-neutral-500 truncate mt-0.5">
              {summary}
            </p>
          )}
        </div>
        <ChevronRightIcon className="w-4 h-4 text-neutral-600 shrink-0" />
      </Link>
      <div className="border-t border-neutral-800/70">
        <Link
          to={`/workouts/${abs.id}`}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/50 active:bg-neutral-800 transition-colors"
        >
          <span className="text-xs text-neutral-500 flex-1">Abs — default program</span>
          <ChevronRightIcon className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
        </Link>
      </div>
    </div>
  );
}

function CalendarHeatmap({ workouts }: { workouts: Workout[] }) {
  const navigate = useNavigate();
  const WEEKS = 12;

  // Build a map: date → workouts on that date
  const byDate = new Map<string, Workout[]>();
  for (const w of workouts) {
    const list = byDate.get(w.date) ?? [];
    list.push(w);
    byDate.set(w.date, list);
  }

  // Find the Monday of WEEKS-1 weeks ago
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Monday
  const startOfThisWeek = new Date(today.getTime() - dayOfWeek * 86_400_000);
  const startDate = new Date(startOfThisWeek.getTime() - (WEEKS - 1) * 7 * 86_400_000);

  const todayStr = today.toISOString().slice(0, 10);

  // Build column-major grid: weeks × days
  const grid: { date: string; workouts: Workout[]; isFuture: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { date: string; workouts: Workout[]; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate.getTime() + (w * 7 + d) * 86_400_000);
      const dateStr = cellDate.toISOString().slice(0, 10);
      col.push({
        date: dateStr,
        workouts: byDate.get(dateStr) ?? [],
        isFuture: dateStr > todayStr,
      });
    }
    grid.push(col);
  }

  // Unique workout types present, for legend
  const presentTypes = [...new Set(workouts.map((w) => w.workout_type))];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400">
          Last {WEEKS} weeks
        </p>
        <div className="flex items-center gap-1.5">
          {presentTypes.map((t) => (
            <span key={t} className="flex items-center gap-1 text-[9px] text-neutral-500">
              <span className={`w-2 h-2 rounded-sm ${TYPE_DOT_BG[t] ?? "bg-neutral-600"}`} />
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-1 justify-center">
        {grid.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((cell, j) => {
              const main = cell.workouts.find((w) => w.workout_type !== "abs") ?? cell.workouts[0];
              const has = !!main && !cell.isFuture;
              return (
                <button
                  key={j}
                  onClick={() => has && navigate(`/workouts/${main.id}`)}
                  disabled={!has}
                  title={has ? `${main.workout_type} · ${cell.date}` : cell.date}
                  className={`w-4 h-4 rounded-[3px] transition-transform ${
                    cell.isFuture
                      ? "bg-transparent"
                      : has
                        ? `${TYPE_DOT_BG[main.workout_type] ?? "bg-neutral-600"} hover:scale-110 active:scale-95`
                        : "bg-neutral-800"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-14 px-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-neutral-800 flex items-center justify-center mb-3 text-neutral-400">
        <CalendarIcon />
      </div>
      <p className="text-neutral-200 font-medium mb-1">No workouts yet</p>
      <p className="text-sm text-neutral-500 max-w-xs mx-auto">
        Log your first workout from the iOS Shortcut, then come back here.
      </p>
    </div>
  );
}

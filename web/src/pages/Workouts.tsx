import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronRightIcon, CalendarIcon } from "../components/icons";

type Workout = {
  id: string;
  date: string;
  workout_type: string;
  notes: string | null;
  raw_message: string | null;
  created_at: string;
};

const TYPE_STYLES: Record<string, string> = {
  chest: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  back: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  legs: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  abs: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  run: "bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30",
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

export default function Workouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) setError(error.message);
      else setWorkouts(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-neutral-900/60 border border-neutral-900 animate-pulse"
          />
        ))}
      </div>
    );
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (workouts.length === 0) return <EmptyState />;

  const groups: { key: string; items: Workout[] }[] = [];
  for (const w of workouts) {
    const k = groupKey(w.date);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(w);
    else groups.push({ key: k, items: [w] });
  }

  return (
    <div className="pb-4 space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 px-1 mb-2">
            {g.key}
          </h2>
          <div className="space-y-2">
            {g.items.map((w) => (
              <Link
                key={w.id}
                to={`/workouts/${w.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 active:bg-neutral-800 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                        TYPE_STYLES[w.workout_type] ??
                        "bg-neutral-800 text-neutral-400 ring-1 ring-inset ring-neutral-700"
                      }`}
                    >
                      {w.workout_type}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatRowDate(w.date)}
                    </span>
                  </div>
                  {(w.notes || w.raw_message) && (
                    <p className="text-sm text-neutral-400 truncate">
                      {w.notes || w.raw_message}
                    </p>
                  )}
                </div>
                <ChevronRightIcon className="w-4 h-4 text-neutral-600 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}
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

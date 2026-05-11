import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Workout = {
  id: string;
  date: string;
  workout_type: string;
  notes: string | null;
  raw_message: string | null;
};
type SetRow = {
  id: string;
  exercise_name: string;
  weight_kg: number | null;
  skipped: boolean;
  is_deviation: boolean;
};
type Run = {
  duration_minutes: number | null;
  distance_km: number | null;
  notes: string | null;
};

export default function WorkoutDetail() {
  const { id } = useParams();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: w, error: we }, { data: s }, { data: r }] =
        await Promise.all([
          supabase.from("workouts").select("*").eq("id", id).single(),
          supabase.from("sets").select("*").eq("workout_id", id),
          supabase
            .from("runs")
            .select("*")
            .eq("workout_id", id)
            .maybeSingle(),
        ]);
      if (we) setError(we.message);
      else {
        setWorkout(w);
        setSets(s || []);
        setRun(r ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!workout) return <p className="text-neutral-500">Not found.</p>;

  return (
    <div className="pb-12">
      <Link to="/workouts" className="text-sm text-neutral-500 hover:text-white">
        ← All workouts
      </Link>
      <header className="mt-3 mb-5">
        <h2 className="text-xl font-semibold capitalize">
          {workout.workout_type}
        </h2>
        <p className="text-sm text-neutral-500">{workout.date}</p>
      </header>

      {workout.raw_message && (
        <Box label="What you typed">{workout.raw_message}</Box>
      )}
      {workout.notes && <Box label="Notes">{workout.notes}</Box>}

      {workout.workout_type === "run" && run && (
        <div className="mt-2 rounded-lg overflow-hidden border border-neutral-800">
          <Stat label="Duration">
            {run.duration_minutes ? `${run.duration_minutes} min` : "—"}
          </Stat>
          <Stat label="Distance">
            {run.distance_km ? `${run.distance_km} km` : "—"}
          </Stat>
        </div>
      )}

      {sets.length > 0 && (
        <div className="mt-2 rounded-lg overflow-hidden border border-neutral-800">
          {sets.map((s) => (
            <div
              key={s.id}
              className={`flex justify-between items-center px-3 py-2 bg-neutral-900 border-b border-neutral-800 last:border-b-0 text-sm ${
                s.skipped ? "opacity-50" : ""
              }`}
            >
              <span
                className={s.is_deviation ? "text-yellow-400" : "text-neutral-100"}
              >
                {s.exercise_name}
              </span>
              <span className="text-neutral-300">
                {s.skipped
                  ? "skipped"
                  : s.weight_kg !== null
                    ? `${s.weight_kg} kg`
                    : "bw"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Box({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 last:border-b-0 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span>{children}</span>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Workout = {
  id: string;
  date: string;
  workout_type: string;
  notes: string | null;
  raw_message: string | null;
  created_at: string;
};

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
        .limit(100);
      if (error) setError(error.message);
      else setWorkouts(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (workouts.length === 0)
    return <p className="text-neutral-500">No workouts logged yet.</p>;

  return (
    <div className="space-y-2 pb-12">
      {workouts.map((w) => (
        <Link
          key={w.id}
          to={`/workouts/${w.id}`}
          className="block px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
        >
          <div className="flex justify-between items-baseline">
            <span className="font-medium capitalize">{w.workout_type}</span>
            <span className="text-xs text-neutral-500">{w.date}</span>
          </div>
          {(w.notes || w.raw_message) && (
            <p className="text-sm text-neutral-400 mt-1 truncate">
              {w.notes || w.raw_message}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

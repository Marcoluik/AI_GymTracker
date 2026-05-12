import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronLeftIcon } from "../components/icons";
import { isTimedExerciseName } from "../data/exerciseCatalog";

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
  reps: number | null;
  set_number: number | null;
  skipped: boolean;
  is_deviation: boolean;
};
type Run = {
  duration_minutes: number | null;
  distance_km: number | null;
  notes: string | null;
};

const TYPE_STYLES: Record<string, string> = {
  chest: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  back: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  legs: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  abs: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  run: "bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30",
};

function labelize(name: string) {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatFullDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatSet(s: SetRow): string {
  if (s.skipped) return "skipped";
  const timed = isTimedExerciseName(s.exercise_name);
  const parts: string[] = [];
  if (s.weight_kg !== null && s.weight_kg !== 0) parts.push(`${s.weight_kg} kg`);
  if (s.reps !== null) {
    if (timed) parts.push(`${s.reps}s`);
    else if (parts.length > 0) parts.push(`× ${s.reps}`);
    else parts.push(`${s.reps} reps`);
  }
  if (parts.length === 0) return s.weight_kg === 0 ? "bw" : "—";
  return parts.join(" ");
}

type EditedSet = { weight_kg: string; reps: string; skipped: boolean };

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [editedSets, setEditedSets] = useState<Record<string, EditedSet>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: w, error: we }, { data: s }, { data: r }] =
        await Promise.all([
          supabase.from("workouts").select("*").eq("id", id).single(),
          supabase
            .from("sets")
            .select("*")
            .eq("workout_id", id)
            .order("exercise_name", { ascending: true })
            .order("set_number", { ascending: true, nullsFirst: true }),
          supabase.from("runs").select("*").eq("workout_id", id).maybeSingle(),
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

  function startEditing() {
    setEditedNotes(workout?.notes ?? "");
    const map: Record<string, EditedSet> = {};
    for (const s of sets) {
      map[s.id] = {
        weight_kg: s.weight_kg !== null ? String(s.weight_kg) : "",
        reps: s.reps !== null ? String(s.reps) : "",
        skipped: s.skipped,
      };
    }
    setEditedSets(map);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setConfirmDelete(false);
  }

  async function saveEdits() {
    if (!workout) return;
    setSaving(true);
    try {
      await supabase
        .from("workouts")
        .update({ notes: editedNotes.trim() || null })
        .eq("id", workout.id);

      for (const s of sets) {
        const e = editedSets[s.id];
        if (!e) continue;
        const wkg = e.weight_kg === "" ? null : parseFloat(e.weight_kg);
        const rps = e.reps === "" ? null : parseInt(e.reps, 10);
        const wasChanged =
          e.skipped !== s.skipped ||
          (wkg ?? null) !== s.weight_kg ||
          (rps ?? null) !== s.reps;
        if (wasChanged) {
          await supabase.from("sets").update({
            weight_kg: e.skipped ? null : (isNaN(wkg as number) ? null : wkg),
            reps: e.skipped ? null : (isNaN(rps as number) ? null : rps),
            skipped: e.skipped,
            is_deviation: true,
          }).eq("id", s.id);
        }
      }

      // Refresh
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", workout.id).single(),
        supabase
          .from("sets")
          .select("*")
          .eq("workout_id", workout.id)
          .order("exercise_name", { ascending: true })
          .order("set_number", { ascending: true, nullsFirst: true }),
      ]);
      if (w) setWorkout(w);
      if (s) setSets(s);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkout() {
    if (!workout) return;
    setDeleting(true);
    await supabase.from("workouts").delete().eq("id", workout.id);
    navigate("/workouts");
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SetRow[]>();
    for (const s of sets) {
      const list = map.get(s.exercise_name) ?? [];
      list.push(s);
      map.set(s.exercise_name, list);
    }
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
  }, [sets]);

  if (loading)
    return (
      <div className="space-y-3">
        <div className="h-6 w-32 rounded bg-neutral-900 animate-pulse" />
        <div className="h-24 rounded-xl bg-neutral-900 animate-pulse" />
        <div className="h-48 rounded-xl bg-neutral-900 animate-pulse" />
      </div>
    );
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!workout) return <p className="text-neutral-500">Not found.</p>;

  const deviationCount = sets.filter((s) => s.is_deviation).length;
  const skippedCount = sets.filter((s) => s.skipped).length;
  const totalVolume = sets.reduce((sum, s) => {
    if (s.skipped) return sum;
    return sum + (s.weight_kg ?? 0) * (s.reps ?? 0);
  }, 0);

  return (
    <div className="pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/workouts"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-white -ml-1"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          All workouts
        </Link>
        {!editing ? (
          <button
            onClick={startEditing}
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={cancelEditing}
              className="text-sm text-neutral-500 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdits}
              disabled={saving}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <header>
        <span
          className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
            TYPE_STYLES[workout.workout_type] ?? "bg-neutral-800 text-neutral-400"
          }`}
        >
          {workout.workout_type}
        </span>
        <h2 className="text-xl font-semibold mt-2">
          {formatFullDate(workout.date)}
        </h2>
      </header>

      {(sets.length > 0 || deviationCount > 0 || skippedCount > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Sets" value={String(sets.length - skippedCount)} />
          <StatTile
            label="Deviations"
            value={String(deviationCount)}
            tone={deviationCount > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="Volume"
            value={totalVolume > 0 ? `${Math.round(totalVolume)} kg` : "—"}
          />
        </div>
      )}

      {workout.raw_message && (
        <Box label="What you typed">{workout.raw_message}</Box>
      )}

      {editing ? (
        <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">
            Notes
          </p>
          <textarea
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder="No notes"
            rows={2}
            className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-600 resize-none outline-none"
          />
        </div>
      ) : (
        workout.notes && <Box label="Notes">{workout.notes}</Box>
      )}

      {workout.workout_type === "run" && run && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Duration"
            value={run.duration_minutes ? `${run.duration_minutes} min` : "—"}
          />
          <StatTile
            label="Distance"
            value={run.distance_km ? `${run.distance_km} km` : "—"}
          />
        </div>
      )}

      {grouped.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 px-1 mb-2">
            Exercises
          </h3>
          <div className="space-y-2">
            {grouped.map(({ name, rows }) => {
              const allSkipped = editing
                ? rows.every((r) => editedSets[r.id]?.skipped)
                : rows.every((r) => r.skipped);
              const anyDeviation = rows.some((r) => r.is_deviation);
              const done = editing
                ? rows.filter((r) => !editedSets[r.id]?.skipped).length
                : rows.filter((r) => !r.skipped).length;
              return (
                <div
                  key={name}
                  className={`rounded-2xl overflow-hidden border ${
                    anyDeviation
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : "border-neutral-800 bg-neutral-900"
                  }`}
                >
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className={`font-medium ${
                          allSkipped ? "text-neutral-500 line-through" : "text-neutral-100"
                        }`}
                      >
                        {labelize(name)}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {allSkipped ? "All skipped" : `${done} ${done === 1 ? "set" : "sets"}`}
                      </div>
                    </div>
                    {anyDeviation && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 shrink-0">
                        Deviation
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-neutral-800/70">
                    {rows.map((r, i) => (
                      <li
                        key={r.id}
                        className={`flex items-center gap-2 px-4 py-2 text-sm ${
                          (editing ? editedSets[r.id]?.skipped : r.skipped) ? "opacity-50" : ""
                        }`}
                      >
                        <span className="text-neutral-500 text-xs w-10 shrink-0">
                          Set {r.set_number ?? i + 1}
                        </span>
                        {editing ? (
                          <EditSetRow
                            setId={r.id}
                            exerciseName={r.exercise_name}
                            value={editedSets[r.id]}
                            onChange={(v) =>
                              setEditedSets((prev) => ({ ...prev, [r.id]: v }))
                            }
                          />
                        ) : (
                          <span
                            className={`ml-auto ${
                              r.is_deviation
                                ? "text-yellow-300 font-medium"
                                : r.skipped
                                  ? "text-neutral-500 line-through"
                                  : "text-neutral-100"
                            }`}
                          >
                            {formatSet(r)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {editing && (
        <div className="pt-2">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Delete workout
            </button>
          ) : (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
              <p className="text-sm text-red-300 text-center">
                Delete this workout and all its sets? This can't be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteWorkout}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-sm font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditSetRow({
  setId,
  exerciseName,
  value,
  onChange,
}: {
  setId: string;
  exerciseName: string;
  value: EditedSet;
  onChange: (v: EditedSet) => void;
}) {
  const timed = isTimedExerciseName(exerciseName);
  return (
    <div className="flex items-center gap-2 ml-auto">
      <button
        onClick={() => onChange({ ...value, skipped: !value.skipped })}
        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
          value.skipped
            ? "border-neutral-600 text-neutral-400 bg-neutral-800"
            : "border-neutral-700 text-neutral-500"
        }`}
      >
        {value.skipped ? "skipped" : "skip"}
      </button>
      {!value.skipped && (
        <>
          <input
            type="number"
            value={value.weight_kg}
            onChange={(e) => onChange({ ...value, weight_kg: e.target.value })}
            placeholder="kg"
            className="w-14 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-right text-neutral-100 outline-none focus:border-neutral-500"
          />
          <input
            type="number"
            value={value.reps}
            onChange={(e) => onChange({ ...value, reps: e.target.value })}
            placeholder={timed ? "sec" : "reps"}
            className="w-14 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-right text-neutral-100 outline-none focus:border-neutral-500"
          />
        </>
      )}
    </div>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        tone === "warning"
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">
        {label}
      </p>
      <p className={`text-lg font-semibold ${tone === "warning" ? "text-yellow-300" : ""}`}>
        {value}
      </p>
    </div>
  );
}

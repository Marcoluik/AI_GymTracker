import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Model, { type Muscle } from "react-body-highlighter";
import { supabase } from "../lib/supabase";
import { ChevronLeftIcon, ChevronDownIcon } from "../components/icons";
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

// Maps a workout_type to the muscles it trains (matches react-body-highlighter names)
const WORKOUT_MUSCLES_TO_LIB: Record<string, Muscle[]> = {
  chest: ["chest", "front-deltoids", "triceps"],
  back: ["upper-back", "lower-back", "trapezius", "biceps"],
  legs: ["quadriceps", "hamstring", "gluteal", "calves"],
  abs: ["abs", "obliques"],
  run: ["quadriceps", "hamstring", "calves"],
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

// Build a short text summary across sets, e.g. "70 kg × 8" or "70–80 kg × 8"
function exerciseSummary(rows: SetRow[]): string {
  const active = rows.filter((r) => !r.skipped);
  if (active.length === 0) return "all skipped";
  const timed = isTimedExerciseName(rows[0].exercise_name);
  const weights = active.map((r) => r.weight_kg).filter((w): w is number => w !== null && w !== 0);
  const reps = active.map((r) => r.reps).filter((r): r is number => r !== null);
  const parts: string[] = [];
  if (weights.length > 0) {
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    parts.push(min === max ? `${min} kg` : `${min}–${max} kg`);
  }
  if (reps.length > 0) {
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    const repStr = min === max ? `${min}` : `${min}–${max}`;
    parts.push(timed ? `${repStr}s` : `× ${repStr}`);
  }
  return parts.length > 0 ? parts.join(" ") : "—";
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
  const [editedDate, setEditedDate] = useState("");
  const [editedSets, setEditedSets] = useState<Record<string, EditedSet>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [priorMax, setPriorMax] = useState<Record<string, number>>({});

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

  // Compute "prior max weight" per exercise for PR badges
  useEffect(() => {
    if (!workout || sets.length === 0) return;
    (async () => {
      const exerciseNames = [...new Set(sets.map((s) => s.exercise_name))];
      const { data: priorWorkouts } = await supabase
        .from("workouts")
        .select("id")
        .lt("date", workout.date);
      const ids = (priorWorkouts ?? []).map((w: { id: string }) => w.id);
      if (ids.length === 0) { setPriorMax({}); return; }
      const { data: priorSets } = await supabase
        .from("sets")
        .select("exercise_name, weight_kg")
        .in("exercise_name", exerciseNames)
        .in("workout_id", ids)
        .eq("skipped", false)
        .not("weight_kg", "is", null);
      const max: Record<string, number> = {};
      for (const s of (priorSets ?? []) as { exercise_name: string; weight_kg: number }[]) {
        if (s.weight_kg === null) continue;
        if (!max[s.exercise_name] || s.weight_kg > max[s.exercise_name]) {
          max[s.exercise_name] = s.weight_kg;
        }
      }
      setPriorMax(max);
    })();
  }, [workout, sets]);

  function isPR(s: SetRow): boolean {
    if (s.skipped || s.weight_kg === null || s.weight_kg <= 0) return false;
    const prev = priorMax[s.exercise_name];
    return prev !== undefined && s.weight_kg > prev;
  }

  function startEditing() {
    setEditedNotes(workout?.notes ?? "");
    setEditedDate(workout?.date ?? "");
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
      const datePatch =
        /^\d{4}-\d{2}-\d{2}$/.test(editedDate) && editedDate !== workout.date
          ? { date: editedDate }
          : {};
      await supabase
        .from("workouts")
        .update({ notes: editedNotes.trim() || null, ...datePatch })
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

  const skippedCount = sets.filter((s) => s.skipped).length;
  const adjustedExerciseCount = grouped.filter(({ rows }) =>
    rows.some((r) => r.is_deviation),
  ).length;
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

      {(sets.length > 0 || adjustedExerciseCount > 0 || skippedCount > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Sets" value={String(sets.length - skippedCount)} />
          <StatTile
            label="Adjusted"
            value={String(adjustedExerciseCount)}
            hint={adjustedExerciseCount > 0 ? `${adjustedExerciseCount === 1 ? "exercise" : "exercises"}` : undefined}
          />
          <StatTile
            label="Volume"
            value={totalVolume > 0 ? `${Math.round(totalVolume)} kg` : "—"}
          />
        </div>
      )}

      {/* Muscle map */}
      {WORKOUT_MUSCLES_TO_LIB[workout.workout_type] && (
        <WorkoutMuscles workoutType={workout.workout_type} />
      )}

      {workout.raw_message && (
        <Box label="What you typed">{workout.raw_message}</Box>
      )}

      {editing ? (
        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">
              Date
            </p>
            <input
              type="date"
              value={editedDate}
              onChange={(e) => setEditedDate(e.target.value)}
              className="w-full bg-transparent text-sm text-neutral-100 outline-none"
            />
          </div>
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
            {grouped.map(({ name, rows }) => (
              <ExerciseBlock
                key={name}
                name={name}
                rows={rows}
                editing={editing}
                editedSets={editedSets}
                onEditChange={(setId, v) =>
                  setEditedSets((prev) => ({ ...prev, [setId]: v }))
                }
                isPR={isPR}
              />
            ))}
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

// ── Exercise block (collapsible) ──────────────────────────────────────────────

function ExerciseBlock({
  name,
  rows,
  editing,
  editedSets,
  onEditChange,
  isPR,
}: {
  name: string;
  rows: SetRow[];
  editing: boolean;
  editedSets: Record<string, EditedSet>;
  onEditChange: (setId: string, v: EditedSet) => void;
  isPR: (s: SetRow) => boolean;
}) {
  // When editing, expanded by default. Otherwise collapsed.
  const [expanded, setExpanded] = useState(editing);

  // Keep in sync if editing state changes externally
  useEffect(() => {
    if (editing) setExpanded(true);
  }, [editing]);

  const allSkipped = editing
    ? rows.every((r) => editedSets[r.id]?.skipped)
    : rows.every((r) => r.skipped);
  const anyAdjusted = rows.some((r) => r.is_deviation);
  const anyPR = rows.some(isPR);
  const done = editing
    ? rows.filter((r) => !editedSets[r.id]?.skipped).length
    : rows.filter((r) => !r.skipped).length;
  const summary = exerciseSummary(rows);

  return (
    <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-800/40 active:bg-neutral-800/60 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                allSkipped ? "text-neutral-500 line-through" : "text-neutral-100"
              }`}
            >
              {labelize(name)}
            </span>
            {anyPR && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                PR
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2">
            <span>
              {allSkipped ? "All skipped" : `${done} ${done === 1 ? "set" : "sets"} · ${summary}`}
            </span>
            {anyAdjusted && (
              <span className="text-[10px] text-neutral-500">· adjusted</span>
            )}
          </div>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-neutral-600 shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <ul className="divide-y divide-neutral-800/70 border-t border-neutral-800/70">
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
                  onChange={(v) => onEditChange(r.id, v)}
                />
              ) : (
                <span className="ml-auto flex items-center gap-1.5">
                  {isPR(r) && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                      PR
                    </span>
                  )}
                  <span
                    className={
                      r.skipped
                        ? "text-neutral-500 line-through"
                        : "text-neutral-100"
                    }
                  >
                    {formatSet(r)}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Workout muscles map ───────────────────────────────────────────────────────

function WorkoutMuscles({ workoutType }: { workoutType: string }) {
  const [view, setView] = useState<"anterior" | "posterior">("anterior");
  const muscles = WORKOUT_MUSCLES_TO_LIB[workoutType] ?? [];
  const data = muscles.length > 0 ? [{ name: "Hit", muscles }] : [];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
        <h3 className="font-semibold text-sm">Muscles trained</h3>
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
      <div className="px-4 py-3 flex justify-center">
        <Model
          data={data}
          type={view}
          highlightedColors={["#16a34a"]}
          bodyColor="#2a2a2a"
          style={{ width: "10rem" }}
        />
      </div>
    </div>
  );
}

// ── Edit set row ──────────────────────────────────────────────────────────────

function EditSetRow({
  setId: _setId,
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

// ── Misc ──────────────────────────────────────────────────────────────────────

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
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-1">
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-[10px] text-neutral-500 mt-0.5">{hint}</p>}
    </div>
  );
}

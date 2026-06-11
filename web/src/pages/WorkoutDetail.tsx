import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Model, { type Muscle } from "react-body-highlighter";
import { supabase } from "../lib/supabase";
import { ChevronLeftIcon, ChevronDownIcon, PlusIcon, CalendarIcon } from "../components/icons";
import { isTimedExerciseName } from "../data/exerciseCatalog";

type Workout = {
  id: string;
  date: string;
  workout_type: string;
  notes: string | null;
  raw_message: string | null;
  session_id: string | null;
};
type SetRow = {
  id: string;
  workout_id: string;
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
  set_number: number | null;
  skipped: boolean;
  is_warmup?: boolean;
  is_deviation: boolean;
};
type Run = {
  duration_minutes: number | null;
  distance_km: number | null;
  notes: string | null;
};
type PreviousExercise = {
  date: string;
  sets: { weight_kg: number | null; reps: number | null }[];
};

const LIBRARY_IMG_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

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
  const clean = name.replace(/_custom_\d+$/, "");
  const s = clean.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToPlate(value: number): number {
  return Math.max(0, Math.round(value / 2.5) * 2.5);
}

function stepString(value: string, delta: number, fallback = 0): string {
  const current = value === "" ? fallback : parseFloat(value);
  const next = roundOne(Math.max(0, (isNaN(current) ? fallback : current) + delta));
  return String(next);
}

function stepIntString(value: string, delta: number, fallback = 1): string {
  const current = value === "" ? fallback : parseInt(value, 10);
  return String(Math.max(1, (isNaN(current) ? fallback : current) + delta));
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
  const active = rows.filter((r) => !r.is_warmup && !r.skipped);
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

function valuesSummary(rows: { weight_kg: number | null; reps: number | null }[], exerciseName: string): string {
  if (rows.length === 0) return "—";
  const timed = isTimedExerciseName(exerciseName);
  const parts = rows.map((r) => {
    const weight = r.weight_kg !== null && r.weight_kg !== 0 ? `${r.weight_kg} kg` : "BW";
    if (r.reps === null) return weight;
    return timed ? `${weight} × ${r.reps}s` : `${weight} × ${r.reps}`;
  });
  return parts.join(" / ");
}

function mostCommon(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function sortSetRows(rows: SetRow[]): SetRow[] {
  return [...rows].sort((a, b) => {
    const byName = a.exercise_name.localeCompare(b.exercise_name);
    if (byName !== 0) return byName;
    if (!!a.is_warmup !== !!b.is_warmup) return a.is_warmup ? -1 : 1;
    return (a.set_number ?? 0) - (b.set_number ?? 0);
  });
}

type EditedSet = { weight_kg: string; reps: string; skipped: boolean; is_warmup: boolean };

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
  const [priorMax, setPriorMax] = useState<Record<string, number>>({});
  const [libraryImages, setLibraryImages] = useState<Record<string, string[]>>({});
  const [previousByExercise, setPreviousByExercise] = useState<Record<string, PreviousExercise>>({});
  const [updatingProgram, setUpdatingProgram] = useState(false);
  const [programUpdateMessage, setProgramUpdateMessage] = useState("");

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
        setSets(sortSetRows((s || []) as SetRow[]));
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
        .select("*")
        .in("exercise_name", exerciseNames)
        .in("workout_id", ids)
        .eq("skipped", false)
        .not("weight_kg", "is", null);
      const max: Record<string, number> = {};
      for (const s of (priorSets ?? []) as SetRow[]) {
        if (s.is_warmup) continue;
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
    if (s.is_warmup) return false;
    const prev = priorMax[s.exercise_name];
    return prev !== undefined && s.weight_kg > prev;
  }

  useEffect(() => {
    if (!workout || sets.length === 0) return;
    let cancelled = false;
    (async () => {
      const exerciseNames = [...new Set(sets.map((s) => s.exercise_name))];
      const { data: priorWorkouts } = await supabase
        .from("workouts")
        .select("id, date")
        .lt("date", workout.date)
        .order("date", { ascending: false })
        .limit(120);
      const workouts = ((priorWorkouts ?? []) as { id: string; date: string }[]);
      const ids = workouts.map((w) => w.id);
      if (ids.length === 0) {
        if (!cancelled) setPreviousByExercise({});
        return;
      }

      const dateByWorkout = new Map(workouts.map((w) => [w.id, w.date]));
      const { data: priorSets } = await supabase
        .from("sets")
        .select("*")
        .in("exercise_name", exerciseNames)
        .in("workout_id", ids)
        .eq("skipped", false);
      if (cancelled) return;

      const latestDateByExercise = new Map<string, string>();
      const groupedSets = new Map<string, SetRow[]>();
      for (const row of (priorSets ?? []) as SetRow[]) {
        if (row.is_warmup) continue;
        const date = dateByWorkout.get(row.workout_id);
        if (!date) continue;
        const currentDate = latestDateByExercise.get(row.exercise_name);
        if (!currentDate || date > currentDate) {
          latestDateByExercise.set(row.exercise_name, date);
          groupedSets.set(row.exercise_name, [row]);
        } else if (date === currentDate) {
          const list = groupedSets.get(row.exercise_name) ?? [];
          list.push(row);
          groupedSets.set(row.exercise_name, list);
        }
      }

      const next: Record<string, PreviousExercise> = {};
      for (const [name, rows] of groupedSets) {
        next[name] = {
          date: latestDateByExercise.get(name) ?? "",
          sets: rows
            .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
            .map((r) => ({ weight_kg: r.weight_kg, reps: r.reps })),
        };
      }
      setPreviousByExercise(next);
    })();
    return () => { cancelled = true; };
  }, [workout, sets]);

  // Fetch library images for the exercises used in this workout. Custom
  // exercises in the program have exercise_name = "machine_hip_thrust" but
  // library.id = "machine_hip_thrust_custom_<timestamp>" — so direct id
  // lookup misses. We bridge via program.exercise_id for those.
  useEffect(() => {
    if (sets.length === 0) return;
    (async () => {
      const exerciseNames = [...new Set(sets.map((s) => s.exercise_name))];
      const map: Record<string, string[]> = {};

      const { data: direct } = await supabase
        .from("exercise_library")
        .select("id, images")
        .in("id", exerciseNames);
      for (const r of (direct ?? []) as { id: string; images: string[] | null }[]) {
        if (r.images && r.images.length > 0) map[r.id] = r.images;
      }

      const missing = exerciseNames.filter((n) => !map[n]);
      if (missing.length > 0) {
        const { data: progRows } = await supabase
          .from("program")
          .select("exercise_name, exercise_id")
          .in("exercise_name", missing)
          .not("exercise_id", "is", null);
        const progList = (progRows ?? []) as { exercise_name: string; exercise_id: string }[];
        const libIds = [...new Set(progList.map((p) => p.exercise_id))];
        if (libIds.length > 0) {
          const { data: libRows } = await supabase
            .from("exercise_library")
            .select("id, images")
            .in("id", libIds);
          const libMap = new Map(
            ((libRows ?? []) as { id: string; images: string[] | null }[]).map((r) => [r.id, r.images]),
          );
          for (const p of progList) {
            const imgs = libMap.get(p.exercise_id);
            if (imgs && imgs.length > 0) map[p.exercise_name] = imgs;
          }
        }
      }

      setLibraryImages(map);
    })();
  }, [sets]);

  // Changing the date also moves any workout logged in the same session
  // (e.g. the abs day attached to a chest day) so the pair stays together.
  async function changeDate(newDate: string) {
    if (!workout || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate === workout.date) return;
    const query = workout.session_id
      ? supabase.from("workouts").update({ date: newDate }).eq("session_id", workout.session_id)
      : supabase.from("workouts").update({ date: newDate }).eq("id", workout.id);
    const { error } = await query;
    if (error) {
      alert(`Couldn't change date: ${error.message}`);
      return;
    }
    setWorkout({ ...workout, date: newDate });
  }

  function startEditing() {
    setEditedNotes(workout?.notes ?? "");
    const map: Record<string, EditedSet> = {};
    for (const s of sets) {
      map[s.id] = {
        weight_kg: s.weight_kg !== null ? String(s.weight_kg) : "",
        reps: s.reps !== null ? String(s.reps) : "",
        skipped: s.skipped,
        is_warmup: !!s.is_warmup,
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
      const { error: wErr } = await supabase
        .from("workouts")
        .update({ notes: editedNotes.trim() || null })
        .eq("id", workout.id);
      if (wErr) { alert(`Couldn't save workout: ${wErr.message}`); return; }

      const failures: string[] = [];
      for (const s of sets) {
        const e = editedSets[s.id];
        if (!e) continue;
        const wkg = e.weight_kg === "" ? null : parseFloat(e.weight_kg);
        const rps = e.reps === "" ? null : parseInt(e.reps, 10);
        const wasChanged =
          e.skipped !== s.skipped ||
          e.is_warmup !== !!s.is_warmup ||
          (wkg ?? null) !== s.weight_kg ||
          (rps ?? null) !== s.reps;
        if (wasChanged) {
          const { error: sErr } = await supabase.from("sets").update({
            weight_kg: e.skipped ? null : (isNaN(wkg as number) ? null : wkg),
            reps: e.skipped ? null : (isNaN(rps as number) ? null : rps),
            skipped: e.skipped,
            is_warmup: e.is_warmup,
            is_deviation: true,
          }).eq("id", s.id);
          if (sErr) failures.push(`set ${s.set_number ?? "?"}: ${sErr.message}`);
        }
      }
      if (failures.length > 0) {
        alert(`Some sets didn't save:\n${failures.join("\n")}`);
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
      if (s) setSets(sortSetRows(s as SetRow[]));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkout() {
    if (!workout) return;
    setDeleting(true);
    const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
    if (error) {
      alert(`Couldn't delete: ${error.message}`);
      setDeleting(false);
      return;
    }
    navigate("/workouts");
  }

  async function updateProgramFromWorkout() {
    if (!workout || updatingProgram || editing || workout.workout_type === "run") return;
    const ok = confirm("Update Program targets from this saved workout?");
    if (!ok) return;

    setUpdatingProgram(true);
    setProgramUpdateMessage("");
    try {
      const { data: programRows, error } = await supabase
        .from("program")
        .select("id, exercise_name, to_failure")
        .eq("workout_type", workout.workout_type);
      if (error) {
        alert(error.message);
        return;
      }

      const programByName = new Map(
        ((programRows ?? []) as { id: number; exercise_name: string; to_failure?: boolean | null }[])
          .map((row) => [row.exercise_name, row]),
      );
      let updated = 0;

      for (const { name, rows } of grouped) {
        const programRow = programByName.get(name);
        if (!programRow) continue;
        const working = rows.filter((r) => !r.is_warmup && !r.skipped);
        if (working.length === 0) continue;

        const reps = working
          .map((r) => r.reps)
          .filter((rep): rep is number => rep !== null);
        const weights = working
          .map((r) => r.weight_kg)
          .filter((weight): weight is number => weight !== null);

        const patch: {
          default_sets: number;
          default_reps?: number | null;
          default_weight_kg?: number | null;
          per_set_weights?: number[] | null;
        } = { default_sets: working.length };

        const commonReps = mostCommon(reps);
        if (!programRow.to_failure && commonReps !== null) {
          patch.default_reps = commonReps;
        }

        if (weights.length === working.length) {
          const unique = [...new Set(weights)];
          if (unique.length === 1) {
            patch.default_weight_kg = unique[0];
            patch.per_set_weights = null;
          } else {
            patch.default_weight_kg = weights[0];
            patch.per_set_weights = weights;
          }
        } else if (weights.length === 0) {
          patch.default_weight_kg = null;
          patch.per_set_weights = null;
        }

        const { error: updateError } = await supabase
          .from("program")
          .update(patch)
          .eq("id", programRow.id);
        if (updateError) {
          alert(updateError.message);
          return;
        }
        updated += 1;
      }

      setProgramUpdateMessage(
        updated > 0
          ? `Program updated from ${updated} ${updated === 1 ? "exercise" : "exercises"}.`
          : "No matching program exercises to update.",
      );
    } finally {
      setUpdatingProgram(false);
    }
  }

  async function addSetToExercise(exerciseName: string, isWarmup: boolean) {
    if (!workout) return;
    const exerciseRows = sets.filter((s) => s.exercise_name === exerciseName);
    const sameKindRows = exerciseRows.filter((s) => !!s.is_warmup === isWarmup);
    const workingRows = exerciseRows.filter((s) => !s.is_warmup && !s.skipped);
    const source = isWarmup
      ? workingRows[0] ?? exerciseRows[0]
      : workingRows[workingRows.length - 1] ?? exerciseRows[exerciseRows.length - 1];
    const sourceWeight = source?.weight_kg ?? null;
    const sourceReps = source?.reps ?? null;
    const timed = isTimedExerciseName(exerciseName);
    const nextSetNumber =
      sameKindRows.reduce((max, row) => Math.max(max, row.set_number ?? 0), 0) + 1;

    const insert = {
      workout_id: workout.id,
      exercise_name: exerciseName,
      weight_kg: isWarmup && sourceWeight !== null
        ? roundToPlate(sourceWeight * 0.5)
        : sourceWeight,
      reps: isWarmup
        ? (timed ? Math.min(sourceReps ?? 60, 30) : 5)
        : sourceReps,
      set_number: nextSetNumber,
      skipped: false,
      is_warmup: isWarmup,
      is_deviation: true,
    };

    const { data, error } = await supabase
      .from("sets")
      .insert(insert)
      .select("*")
      .single();
    if (error) {
      alert(`Couldn't add set: ${error.message}`);
      return;
    }

    const row = data as SetRow;
    setSets((prev) => sortSetRows([...prev, row]));
    setEditedSets((prev) => ({
      ...prev,
      [row.id]: {
        weight_kg: row.weight_kg !== null ? String(row.weight_kg) : "",
        reps: row.reps !== null ? String(row.reps) : "",
        skipped: row.skipped,
        is_warmup: !!row.is_warmup,
      },
    }));
  }

  async function deleteSet(setId: string) {
    const ok = confirm("Delete this set?");
    if (!ok) return;

    const { error } = await supabase.from("sets").delete().eq("id", setId);
    if (error) {
      alert(`Couldn't delete set: ${error.message}`);
      return;
    }

    setSets((prev) => prev.filter((s) => s.id !== setId));
    setEditedSets((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
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

  const workingSets = sets.filter((s) => !s.is_warmup);
  const skippedCount = workingSets.filter((s) => s.skipped).length;
  const adjustedExerciseCount = grouped.filter(({ rows }) =>
    rows.some((r) => !r.is_warmup && r.is_deviation),
  ).length;
  const totalVolume = workingSets.reduce((sum, s) => {
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
        <label className="relative mt-2 flex w-fit cursor-pointer items-center gap-2">
          <h2 className="text-xl font-semibold">{formatFullDate(workout.date)}</h2>
          <CalendarIcon className="w-4 h-4 text-neutral-500" />
          <input
            type="date"
            value={workout.date}
            onChange={(e) => changeDate(e.target.value)}
            aria-label="Change workout date"
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </label>
        {workout.session_id && (
          <p className="text-[11px] text-neutral-500 mt-1">
            Changing the date also moves the attached abs workout.
          </p>
        )}
      </header>

      {(workingSets.length > 0 || adjustedExerciseCount > 0 || skippedCount > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Sets" value={String(workingSets.length - skippedCount)} />
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
                images={libraryImages[name]}
                previous={previousByExercise[name]}
                onAddSet={addSetToExercise}
                onDeleteSet={deleteSet}
              />
            ))}
          </div>
        </section>
      )}

      {!editing && workout.workout_type !== "run" && grouped.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Use this as Program</p>
              <p className="text-xs text-neutral-500 mt-1">
                Copies saved working sets, reps, and weights into your Program.
              </p>
              {programUpdateMessage && (
                <p className="text-xs text-emerald-400 mt-2">{programUpdateMessage}</p>
              )}
            </div>
            <button
              type="button"
              onClick={updateProgramFromWorkout}
              disabled={updatingProgram}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              {updatingProgram ? "Updating" : "Update"}
            </button>
          </div>
        </div>
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
  images,
  previous,
  onAddSet,
  onDeleteSet,
}: {
  name: string;
  rows: SetRow[];
  editing: boolean;
  editedSets: Record<string, EditedSet>;
  onEditChange: (setId: string, v: EditedSet) => void;
  isPR: (s: SetRow) => boolean;
  images?: string[];
  previous?: PreviousExercise;
  onAddSet: (exerciseName: string, isWarmup: boolean) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
}) {
  // When editing, expanded by default. Otherwise collapsed.
  const [expanded, setExpanded] = useState(editing);

  // Keep in sync if editing state changes externally
  useEffect(() => {
    if (editing) setExpanded(true);
  }, [editing]);

  const isCurrentWarmup = (row: SetRow) =>
    editing ? !!editedSets[row.id]?.is_warmup : !!row.is_warmup;
  const isCurrentSkipped = (row: SetRow) =>
    editing ? !!editedSets[row.id]?.skipped : row.skipped;
  const workingRows = rows.filter((r) => !isCurrentWarmup(r));
  const allSkipped = editing
    ? workingRows.every(isCurrentSkipped)
    : workingRows.every((r) => r.skipped);
  const anyAdjusted = workingRows.some((r) => r.is_deviation);
  const anyPR = rows.some(isPR);
  const done = editing
    ? workingRows.filter((r) => !isCurrentSkipped(r)).length
    : workingRows.filter((r) => !r.skipped).length;
  const summary = exerciseSummary(rows);
  const warmupCount = rows.filter((r) => isCurrentWarmup(r) && !isCurrentSkipped(r)).length;
  const firstWorking = workingRows[0];
  const firstEdited = firstWorking ? editedSets[firstWorking.id] : undefined;

  function copyFirstSetToRest() {
    if (!firstEdited || workingRows.length < 2) return;
    for (const row of workingRows.slice(1)) {
      const current = editedSets[row.id];
      onEditChange(row.id, {
        ...firstEdited,
        is_warmup: current?.is_warmup ?? !!row.is_warmup,
      });
    }
  }

  function copyPreviousWorkout() {
    if (!previous || previous.sets.length === 0) return;
    workingRows.forEach((row, index) => {
      const source = previous.sets[index] ?? previous.sets[previous.sets.length - 1];
      onEditChange(row.id, {
        weight_kg: source.weight_kg !== null ? String(source.weight_kg) : "",
        reps: source.reps !== null ? String(source.reps) : "",
        skipped: false,
        is_warmup: editedSets[row.id]?.is_warmup ?? !!row.is_warmup,
      });
    });
  }

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
            {warmupCount > 0 && (
              <span className="text-[10px] text-neutral-500">
                · {warmupCount} {warmupCount === 1 ? "warmup" : "warmups"}
              </span>
            )}
            {anyAdjusted && (
              <span className="text-[10px] text-neutral-500">· adjusted</span>
            )}
          </div>
          {previous && (
            <div className="text-[10px] text-neutral-600 mt-1 truncate">
              Last: {valuesSummary(previous.sets, name)}
            </div>
          )}
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-neutral-600 shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="page-fade">
        {images && images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 border-t border-neutral-800/70 scrollbar-none">
            {images.map((img, i) => (
              <img
                key={i}
                src={`${LIBRARY_IMG_BASE}${img}`}
                alt=""
                loading="lazy"
                className="h-24 w-auto rounded-lg shrink-0 object-cover bg-neutral-800"
              />
            ))}
          </div>
        )}
        {editing && (workingRows.length > 1 || previous) && (
          <div className="border-t border-neutral-800/70 px-4 py-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {previous && (
              <button
                type="button"
                onClick={copyPreviousWorkout}
                className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 active:bg-neutral-700"
              >
                Copy last workout
              </button>
            )}
            {workingRows.length > 1 && (
              <button
                type="button"
                onClick={copyFirstSetToRest}
                className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 active:bg-neutral-700"
              >
                Copy set 1 to all sets
              </button>
            )}
          </div>
        )}
        {editing && (
          <div className="border-t border-neutral-800/70 px-4 py-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAddSet(name, true)}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/15 active:bg-amber-500/20"
            >
              Add warmup
            </button>
            <button
              type="button"
              onClick={() => onAddSet(name, false)}
              className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 active:bg-neutral-700"
            >
              Add set
            </button>
          </div>
        )}
        <ul className="divide-y divide-neutral-800/70 border-t border-neutral-800/70">
          {rows.map((r, i) => {
            const edited = editedSets[r.id];
            const isWarmup = editing ? !!edited?.is_warmup : !!r.is_warmup;
            const isSkipped = editing ? !!edited?.skipped : r.skipped;
            return (
              <li
                key={r.id}
                className={`${editing ? "px-4 py-3 text-sm" : "flex items-center gap-2 px-4 py-2 text-sm"} ${
                  isSkipped ? "opacity-50" : ""
                }`}
              >
                {editing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-xs">
                        {isWarmup ? "Warmup" : "Set"} {r.set_number ?? i + 1}
                      </span>
                      {isWarmup && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          warmup
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteSet(r.id)}
                        className="ml-auto text-[10px] font-medium text-red-400/80 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                    <EditSetRow
                      setId={r.id}
                      exerciseName={r.exercise_name}
                      value={edited}
                      onChange={(v) => onEditChange(r.id, v)}
                    />
                  </div>
                ) : (
                  <>
                  <span className="text-neutral-500 text-xs w-10 shrink-0">
                    {isWarmup ? "WU" : "Set"} {r.set_number ?? i + 1}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {isWarmup && (
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">
                        WU
                      </span>
                    )}
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
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <Link
          to={`/exercise/${encodeURIComponent(name)}`}
          className="block text-center text-[11px] font-medium text-neutral-500 hover:text-white py-2 border-t border-neutral-800/70"
        >
          View full progress →
        </Link>
        </div>
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
  if (!value) return null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, is_warmup: !value.is_warmup })}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            value.is_warmup
              ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
              : "border-neutral-700 bg-neutral-800/40 text-neutral-300 hover:bg-neutral-800"
          }`}
        >
          {value.is_warmup ? "Warmup set" : "Working set"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, skipped: !value.skipped })}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            value.skipped
              ? "border-neutral-600 bg-neutral-800 text-neutral-300"
              : "border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          }`}
        >
          {value.skipped ? "Skipped" : "Mark skipped"}
        </button>
      </div>
      {!value.skipped && (
        <div className="grid grid-cols-2 gap-2">
          <SetStepperField
            label="kg"
            value={value.weight_kg}
            placeholder="kg"
            step={2.5}
            inputMode="decimal"
            onMinus={() => onChange({ ...value, weight_kg: stepString(value.weight_kg, -2.5, 0) })}
            onPlus={() => onChange({ ...value, weight_kg: stepString(value.weight_kg, 2.5, 0) })}
            onInput={(next) => onChange({ ...value, weight_kg: next })}
          />
          <SetStepperField
            label={timed ? "sec" : "reps"}
            value={value.reps}
            placeholder={timed ? "sec" : "reps"}
            step={timed ? 5 : 1}
            inputMode="numeric"
            onMinus={() =>
              onChange({
                ...value,
                reps: stepIntString(value.reps, timed ? -5 : -1, timed ? 60 : 1),
              })
            }
            onPlus={() =>
              onChange({
                ...value,
                reps: stepIntString(value.reps, timed ? 5 : 1, timed ? 60 : 1),
              })
            }
            onInput={(next) => onChange({ ...value, reps: next })}
          />
        </div>
      )}
    </div>
  );
}

function SetStepperField({
  label,
  value,
  placeholder,
  step,
  inputMode,
  onMinus,
  onPlus,
  onInput,
}: {
  label: string;
  value: string;
  placeholder: string;
  step: number;
  inputMode: "decimal" | "numeric";
  onMinus: () => void;
  onPlus: () => void;
  onInput: (next: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-500">
        {label}
      </div>
      <div className="flex overflow-hidden rounded-lg bg-neutral-800 border border-neutral-700 focus-within:border-neutral-500">
        <button
          type="button"
          onClick={onMinus}
          className="h-10 w-10 shrink-0 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600"
          aria-label={`Decrease ${label}`}
        >
          -
        </button>
        <input
          type="number"
          inputMode={inputMode}
          step={step}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-1 text-center text-base text-neutral-100 outline-none placeholder-neutral-600"
        />
        <button
          type="button"
          onClick={onPlus}
          className="h-10 w-10 shrink-0 flex items-center justify-center text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600"
          aria-label={`Increase ${label}`}
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
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

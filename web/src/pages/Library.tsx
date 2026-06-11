import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import Sheet from "../components/Sheet";
import { PlusIcon, SearchIcon, TrashIcon, XIcon } from "../components/icons";

const IMG_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// ── Types ─────────────────────────────────────────────────────────────────────

type Exercise = {
  id: string;
  name: string;
  category: string | null;
  level: string | null;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  force: string | null;
  mechanic: string | null;
  instructions: string[];
  images: string[] | null;
  notes: string | null;
  is_custom: boolean;
};

type FormState = {
  name: string;
  category: string;
  equipment: string;
  level: string;
  force: string;
  mechanic: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "", category: "", equipment: "", level: "beginner",
    force: "", mechanic: "",
    primaryMuscles: [], secondaryMuscles: [],
    instructions: [""], notes: "",
  };
}

function formFromExercise(ex: Exercise): FormState {
  return {
    name: ex.name,
    category: ex.category ?? "",
    equipment: ex.equipment ?? "",
    level: ex.level ?? "beginner",
    force: ex.force ?? "",
    mechanic: ex.mechanic ?? "",
    primaryMuscles: ex.primary_muscles ?? [],
    secondaryMuscles: ex.secondary_muscles ?? [],
    instructions: ex.instructions?.length > 0 ? ex.instructions : [""],
    notes: ex.notes ?? "",
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_FILTERS = [
  { label: "All", value: null },
  { label: "Chest", value: "chest" },
  { label: "Back", value: "lats" },
  { label: "Legs", value: "quadriceps" },
  { label: "Abs", value: "abdominals" },
  { label: "Shoulders", value: "shoulders" },
  { label: "Arms", value: "biceps" },
];

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-300",
  intermediate: "bg-sky-500/15 text-sky-300",
  expert: "bg-orange-500/15 text-orange-300",
};

const CATEGORIES = [
  "Strength", "Cardio", "Stretching", "Plyometrics",
  "Olympic Weightlifting", "Powerlifting", "Strongman",
];

const ALL_MUSCLES = [
  "chest", "lats", "middle back", "lower back", "traps",
  "quadriceps", "hamstrings", "glutes", "calves",
  "abdominals", "obliques", "shoulders", "biceps", "triceps", "forearms",
];

function muscleColor(muscle: string): string {
  if (["chest"].includes(muscle)) return "bg-sky-500/15 text-sky-300";
  if (["lats", "middle back", "lower back", "traps"].includes(muscle))
    return "bg-violet-500/15 text-violet-300";
  if (["quadriceps", "hamstrings", "glutes", "calves"].includes(muscle))
    return "bg-emerald-500/15 text-emerald-300";
  if (["abdominals", "obliques"].includes(muscle))
    return "bg-rose-500/15 text-rose-300";
  return "bg-neutral-800 text-neutral-400";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Library() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [adding, setAdding] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    let cancelled = false;
    debounce.current = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from("exercise_library")
        .select("*", { count: "exact" })
        .order("name")
        .limit(50);

      const words = search.trim().split(/\s+/).filter(Boolean);
      for (const word of words) q = q.ilike("name", `%${word}%`);
      if (muscleFilter) q = q.contains("primary_muscles", [muscleFilter]);

      const { data, count } = await q;
      if (cancelled) return;
      setExercises((data as Exercise[]) ?? []);
      if (count !== null) setTotal(count);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [search, muscleFilter]);

  async function fetchExercises() {
    // Manual re-fetch (used after add/delete)
    setLoading(true);
    let q = supabase
      .from("exercise_library")
      .select("*", { count: "exact" })
      .order("name")
      .limit(50);
    const words = search.trim().split(/\s+/).filter(Boolean);
    for (const word of words) q = q.ilike("name", `%${word}%`);
    if (muscleFilter) q = q.contains("primary_muscles", [muscleFilter]);
    const { data, count } = await q;
    setExercises((data as Exercise[]) ?? []);
    if (count !== null) setTotal(count);
    setLoading(false);
  }

  function onSaved(updated: Exercise) {
    setSelected(updated);
    fetchExercises();
  }

  function onDeleted() {
    setSelected(null);
    fetchExercises();
  }

  return (
    <div className="pb-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-neutral-600 placeholder-neutral-600"
        />
      </div>

      {/* Muscle filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        {MUSCLE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setMuscleFilter(f.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              muscleFilter === f.value
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count + add custom */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-neutral-500">
          {loading ? "Searching…" : total !== null ? `${total.toLocaleString()} exercises` : ""}
        </p>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add custom
        </button>
      </div>

      {/* List */}
      {exercises.length === 0 && !loading ? (
        <p className="text-center text-sm text-neutral-500 py-10">No exercises found.</p>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
          {exercises.map((ex, i) => (
            <button
              key={ex.id}
              onClick={() => setSelected(ex)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-neutral-800/50 active:bg-neutral-800 transition-colors ${
                i < exercises.length - 1 ? "border-b border-neutral-800" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-neutral-100">{ex.name}</span>
                  {ex.is_custom && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ex.primary_muscles?.slice(0, 3).map((m) => (
                    <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${muscleColor(m)}`}>
                      {m}
                    </span>
                  ))}
                  {ex.equipment && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-neutral-800 text-neutral-500">
                      {ex.equipment}
                    </span>
                  )}
                </div>
              </div>
              {ex.level && (
                <span className={`shrink-0 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded mt-0.5 ${LEVEL_COLORS[ex.level] ?? "bg-neutral-800 text-neutral-500"}`}>
                  {ex.level}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {total !== null && total > 50 && (
        <p className="text-center text-xs text-neutral-600">
          Showing first 50 — search to narrow down
        </p>
      )}

      {/* Exercise detail / edit sheet */}
      {selected && (
        <ExerciseSheet
          exercise={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}

      {/* Add custom sheet */}
      {adding && (
        <AddCustomSheet
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); fetchExercises(); }}
        />
      )}
    </div>
  );
}

// ── Exercise sheet (view + edit) ──────────────────────────────────────────────

function ExerciseSheet({
  exercise,
  onClose,
  onSaved,
  onDeleted,
}: {
  exercise: Exercise;
  onClose: () => void;
  onSaved: (updated: Exercise) => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formFromExercise(exercise));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function cancel() {
    setForm(formFromExercise(exercise));
    setMode("view");
    setConfirmDelete(false);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const cleanSteps = form.instructions.map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase
      .from("exercise_library")
      .update({
        name: form.name.trim(),
        category: form.category || null,
        equipment: form.equipment.trim() || null,
        level: form.level || null,
        force: form.force || null,
        mechanic: form.mechanic || null,
        primary_muscles: form.primaryMuscles,
        secondary_muscles: form.secondaryMuscles,
        instructions: cleanSteps,
        notes: form.notes.trim() || null,
      })
      .eq("id", exercise.id);
    setSaving(false);
    if (error) {
      alert(error.message);
    } else {
      const updated: Exercise = {
        ...exercise,
        name: form.name.trim(),
        category: form.category || null,
        equipment: form.equipment.trim() || null,
        level: form.level || null,
        force: form.force || null,
        mechanic: form.mechanic || null,
        primary_muscles: form.primaryMuscles,
        secondary_muscles: form.secondaryMuscles,
        instructions: cleanSteps,
        notes: form.notes.trim() || null,
      };
      setMode("view");
      onSaved(updated);
    }
  }

  async function deleteExercise() {
    const { error } = await supabase
      .from("exercise_library")
      .delete()
      .eq("id", exercise.id);
    if (error) {
      if (error.code === "23503") {
        alert("This exercise is in your program. Remove it from Program first, then delete.");
      } else {
        alert(error.message);
      }
      setConfirmDelete(false);
    } else {
      onDeleted();
    }
  }

  const title = mode === "edit" ? "Edit exercise" : exercise.name;

  return (
    <Sheet open onClose={mode === "edit" ? cancel : onClose} title={title}>
      {mode === "view" ? (
        <div className="space-y-4">
          {/* Images */}
          {exercise.images && exercise.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scrollbar-none">
              {exercise.images.map((img, i) => (
                <img
                  key={i}
                  src={`${IMG_BASE}${img}`}
                  alt={`${exercise.name} step ${i + 1}`}
                  loading="lazy"
                  className="h-36 w-auto rounded-xl shrink-0 object-cover bg-neutral-800"
                />
              ))}
            </div>
          )}

          {/* Muscles */}
          <div className="flex flex-wrap gap-1.5">
            {exercise.primary_muscles?.map((m) => (
              <span key={m} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${muscleColor(m)}`}>
                {m}
              </span>
            ))}
            {exercise.secondary_muscles?.map((m) => (
              <span key={m} className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-neutral-800 text-neutral-500">
                {m}
              </span>
            ))}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-3 gap-2">
            {exercise.equipment && <InfoTile label="Equipment" value={exercise.equipment} />}
            {exercise.level && <InfoTile label="Level" value={exercise.level} />}
            {exercise.category && <InfoTile label="Category" value={exercise.category} />}
            {exercise.force && <InfoTile label="Force" value={exercise.force} />}
            {exercise.mechanic && <InfoTile label="Mechanic" value={exercise.mechanic} />}
          </div>

          {/* Notes */}
          {exercise.notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-1.5">
                Notes
              </p>
              <p className="text-sm text-neutral-300 leading-relaxed">{exercise.notes}</p>
            </div>
          )}

          {/* Instructions */}
          {exercise.instructions?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-2">
                Instructions
              </p>
              <ol className="space-y-2">
                {exercise.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-neutral-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-800 text-neutral-500 text-[11px] font-semibold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={() => { setForm(formFromExercise(exercise)); setMode("edit"); }}
            className="w-full py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
          >
            Edit
          </button>

          {confirmDelete ? (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-lg border border-neutral-700 text-sm text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={deleteExercise}
                className="flex-1 py-3 rounded-lg bg-red-600 text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-red-900/60 text-red-400 hover:bg-red-950/40 text-sm font-medium"
            >
              <TrashIcon className="w-4 h-4" />
              Delete exercise
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <ExerciseFormFields state={form} onChange={patch} />

          <div className="flex gap-3">
            <button
              onClick={cancel}
              className="flex-1 py-3 rounded-lg border border-neutral-700 text-sm text-neutral-300"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!form.name.trim() || saving}
              className="flex-1 py-3 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {confirmDelete ? (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-lg border border-neutral-700 text-sm text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={deleteExercise}
                className="flex-1 py-3 rounded-lg bg-red-600 text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-red-900/60 text-red-400 hover:bg-red-950/40 text-sm font-medium"
            >
              <TrashIcon className="w-4 h-4" />
              Delete exercise
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ── Add custom sheet ──────────────────────────────────────────────────────────

function AddCustomSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const id =
      form.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") +
      "_custom_" +
      Date.now();
    const cleanSteps = form.instructions.map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("exercise_library").insert({
      id,
      name: form.name.trim(),
      category: form.category || null,
      equipment: form.equipment.trim() || null,
      level: form.level || null,
      force: form.force || null,
      mechanic: form.mechanic || null,
      primary_muscles: form.primaryMuscles,
      secondary_muscles: form.secondaryMuscles,
      instructions: cleanSteps,
      notes: form.notes.trim() || null,
      is_custom: true,
    });
    setSaving(false);
    if (error) alert(error.message);
    else onSaved();
  }

  return (
    <Sheet open onClose={onClose} title="Add custom exercise">
      <div className="space-y-5">
        <ExerciseFormFields state={form} onChange={patch} autoFocus />
        <button
          onClick={save}
          disabled={!form.name.trim() || saving}
          className="w-full py-3.5 rounded-lg bg-white text-black font-semibold disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add exercise"}
        </button>
      </div>
    </Sheet>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────

function ExerciseFormFields({
  state,
  onChange,
  autoFocus,
}: {
  state: FormState;
  onChange: (patch: Partial<FormState>) => void;
  autoFocus?: boolean;
}) {
  function setStep(i: number, value: string) {
    const next = [...state.instructions];
    next[i] = value;
    onChange({ instructions: next });
  }
  function addStep() {
    onChange({ instructions: [...state.instructions, ""] });
  }
  function removeStep(i: number) {
    onChange({ instructions: state.instructions.filter((_, idx) => idx !== i) });
  }
  function togglePrimary(m: string) {
    const inPrimary = state.primaryMuscles.includes(m);
    onChange({
      primaryMuscles: inPrimary
        ? state.primaryMuscles.filter((x) => x !== m)
        : [...state.primaryMuscles, m],
      secondaryMuscles: state.secondaryMuscles.filter((x) => x !== m),
    });
  }
  function toggleSecondary(m: string) {
    const inSec = state.secondaryMuscles.includes(m);
    onChange({
      secondaryMuscles: inSec
        ? state.secondaryMuscles.filter((x) => x !== m)
        : [...state.secondaryMuscles, m],
      primaryMuscles: state.primaryMuscles.filter((x) => x !== m),
    });
  }

  return (
    <>
      {/* Name */}
      <div>
        <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
          Name *
        </label>
        <input
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Cable Fly"
          autoFocus={autoFocus}
          className="w-full bg-neutral-800 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
        />
      </div>

      {/* Category + Level */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Category
          </label>
          <select
            value={state.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 text-neutral-200"
          >
            <option value="">— none —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Level
          </label>
          <select
            value={state.level}
            onChange={(e) => onChange({ level: e.target.value })}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 text-neutral-200"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </div>
      </div>

      {/* Equipment + Force + Mechanic */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Equipment
          </label>
          <input
            value={state.equipment}
            onChange={(e) => onChange({ equipment: e.target.value })}
            placeholder="e.g. cable"
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Force
          </label>
          <select
            value={state.force}
            onChange={(e) => onChange({ force: e.target.value })}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 text-neutral-200"
          >
            <option value="">—</option>
            <option value="push">Push</option>
            <option value="pull">Pull</option>
            <option value="static">Static</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Mechanic
          </label>
          <select
            value={state.mechanic}
            onChange={(e) => onChange({ mechanic: e.target.value })}
            className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 text-neutral-200"
          >
            <option value="">—</option>
            <option value="compound">Compound</option>
            <option value="isolation">Isolation</option>
          </select>
        </div>
      </div>

      {/* Primary muscles */}
      <MusclePicker
        label="Primary muscles"
        selected={state.primaryMuscles}
        onToggle={togglePrimary}
      />

      {/* Secondary muscles */}
      <MusclePicker
        label="Secondary muscles"
        selected={state.secondaryMuscles}
        onToggle={toggleSecondary}
      />

      {/* Notes */}
      <div>
        <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
          Notes
        </label>
        <textarea
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Personal notes, cues, tips…"
          rows={2}
          className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500 resize-none"
        />
      </div>

      {/* Instructions */}
      <div>
        <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
          Instructions
        </label>
        <div className="space-y-2">
          {state.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 mt-2.5 rounded-full bg-neutral-800 text-neutral-500 text-[11px] font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <textarea
                value={step}
                onChange={(e) => setStep(i, e.target.value)}
                placeholder={`Step ${i + 1}…`}
                rows={2}
                className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-600 resize-none"
              />
              {state.instructions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="shrink-0 mt-2 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add step
        </button>
      </div>
    </>
  );
}

// ── Muscle picker ─────────────────────────────────────────────────────────────

function MusclePicker({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: string[];
  onToggle: (m: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ALL_MUSCLES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onToggle(m)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selected.includes(m)
                ? "bg-white text-black font-semibold"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Info tile ─────────────────────────────────────────────────────────────────

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-neutral-800 border border-neutral-700">
      <p className="text-[9px] uppercase tracking-wider font-semibold text-neutral-500 mb-0.5">{label}</p>
      <p className="text-xs font-medium capitalize">{value}</p>
    </div>
  );
}

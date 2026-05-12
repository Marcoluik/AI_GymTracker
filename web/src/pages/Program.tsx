import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  catalogForType,
  filterCatalog,
  isTimedExerciseName,
  type CatalogExercise,
} from "../data/exerciseCatalog";
import Sheet from "../components/Sheet";
import Toggle from "../components/Toggle";
import {
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  CheckIcon,
} from "../components/icons";

type Row = {
  id: number;
  workout_type: string;
  exercise_name: string;
  default_weight_kg: number | null;
  default_sets: number | null;
  default_reps: number | null;
  display_order: number;
  is_bodyweight_base: boolean;
};

type ProgramFromDb = Omit<Row, "is_bodyweight_base"> & {
  is_bodyweight_base?: boolean | null;
};

const TYPES = ["chest", "back", "legs", "abs"] as const;
const TYPE_LABEL: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  abs: "Abs",
};

function labelize(name: string) {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function repsLabel(name: string, reps: number | null): string {
  if (reps === null || reps === undefined) return "—";
  return isTimedExerciseName(name) ? `${reps}s` : `${reps} reps`;
}

function rowSummary(row: Row): string {
  const parts: string[] = [];
  if (row.default_sets) parts.push(`${row.default_sets} sets`);
  parts.push(repsLabel(row.exercise_name, row.default_reps));
  if (row.is_bodyweight_base) {
    parts.push(
      row.default_weight_kg && row.default_weight_kg > 0
        ? `BW + ${row.default_weight_kg} kg`
        : "BW",
    );
  } else if (row.default_weight_kg !== null) {
    parts.push(`${row.default_weight_kg} kg`);
  }
  return parts.join(" · ");
}

export default function Program() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("program")
      .select("*")
      .order("workout_type")
      .order("display_order");
    if (error) setError(error.message);
    else {
      const raw = (data ?? []) as ProgramFromDb[];
      setRows(
        raw.map((r) => ({
          ...r,
          is_bodyweight_base: !!r.is_bodyweight_base,
        })),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRow(id: number, patch: Partial<Row>) {
    const { error } = await supabase.from("program").update(patch).eq("id", id);
    if (error) alert(error.message);
    else await load();
  }

  async function deleteRow(id: number) {
    const { error } = await supabase.from("program").delete().eq("id", id);
    if (error) alert(error.message);
    else await load();
  }

  async function addRow(
    type: string,
    name: string,
    weight: string,
    sets: string,
    reps: string,
    isBodyweightBase: boolean,
  ) {
    const trimmed = normalize(name);
    if (!trimmed) {
      alert("Exercise name required");
      return;
    }
    const typeRows = rows.filter((r) => r.workout_type === type);
    const maxOrder = typeRows.reduce(
      (m, r) => Math.max(m, r.display_order),
      0,
    );
    const { error } = await supabase.from("program").insert({
      workout_type: type,
      exercise_name: trimmed,
      default_weight_kg: weight === "" ? null : parseFloat(weight),
      default_sets: sets === "" ? null : parseInt(sets, 10),
      default_reps: reps === "" ? null : parseInt(reps, 10),
      display_order: maxOrder + 1,
      is_bodyweight_base: isBodyweightBase,
    });
    if (error) alert(error.message);
    else await load();
  }

  async function moveRow(workoutType: string, rowId: number, direction: -1 | 1) {
    const list = rows
      .filter((r) => r.workout_type === workoutType)
      .sort((a, b) => a.display_order - b.display_order);
    const i = list.findIndex((r) => r.id === rowId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    const staging =
      Math.max(...rows.map((r) => r.display_order), 0) + 10_000 + a.id;
    const oa = a.display_order;
    const ob = b.display_order;
    const { error: e1 } = await supabase
      .from("program")
      .update({ display_order: staging })
      .eq("id", a.id);
    if (e1) {
      alert(e1.message);
      return;
    }
    const { error: e2 } = await supabase
      .from("program")
      .update({ display_order: oa })
      .eq("id", b.id);
    if (e2) {
      alert(e2.message);
      await supabase.from("program").update({ display_order: oa }).eq("id", a.id);
      return;
    }
    const { error: e3 } = await supabase
      .from("program")
      .update({ display_order: ob })
      .eq("id", a.id);
    if (e3) alert(e3.message);
    await load();
  }

  if (loading)
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-neutral-900/60 border border-neutral-900 animate-pulse"
          />
        ))}
      </div>
    );
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div className="space-y-6 pb-4">
      <p className="text-sm text-neutral-400 px-1">
        Your weekly split. Tap an exercise to edit it.
      </p>
      {TYPES.map((type) => {
        const typeRows = rows
          .filter((r) => r.workout_type === type)
          .sort((a, b) => a.display_order - b.display_order);
        return (
          <section key={type}>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400">
                {TYPE_LABEL[type]}
              </h2>
              <span className="text-[11px] text-neutral-600">
                {typeRows.length} {typeRows.length === 1 ? "exercise" : "exercises"}
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800">
              {typeRows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">
                  No exercises yet
                </p>
              ) : (
                typeRows.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setEditing(r)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left border-b border-neutral-800 last:border-b-0 active:bg-neutral-800/80 hover:bg-neutral-800/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[15px] truncate">
                        {labelize(r.exercise_name)}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">
                        {rowSummary(r)}
                      </div>
                    </div>
                    <ChevronRightIcon className="w-4 h-4 text-neutral-600 shrink-0" />
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setAddingType(type)}
                className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-950/40 hover:bg-neutral-800/40 active:bg-neutral-800 border-t border-neutral-800"
              >
                <PlusIcon className="w-4 h-4" />
                Add exercise
              </button>
            </div>
          </section>
        );
      })}

      {editing && (
        <EditSheet
          row={editing}
          siblings={rows
            .filter((r) => r.workout_type === editing.workout_type)
            .sort((a, b) => a.display_order - b.display_order)}
          onClose={() => setEditing(null)}
          onPatch={(patch) => updateRow(editing.id, patch)}
          onDelete={async () => {
            if (!confirm(`Delete "${labelize(editing.exercise_name)}"?`)) return;
            await deleteRow(editing.id);
            setEditing(null);
          }}
          onMove={async (dir) => {
            await moveRow(editing.workout_type, editing.id, dir);
          }}
        />
      )}
      {addingType && (
        <AddSheet
          type={addingType}
          onClose={() => setAddingType(null)}
          onAdd={async (name, weight, sets, reps, bw) => {
            await addRow(addingType, name, weight, sets, reps, bw);
            setAddingType(null);
          }}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-1.5">
        {label}
      </label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
      />
    </div>
  );
}

function EditSheet({
  row,
  siblings,
  onClose,
  onPatch,
  onDelete,
  onMove,
}: {
  row: Row;
  siblings: Row[];
  onClose: () => void;
  onPatch: (patch: Partial<Row>) => Promise<void>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => Promise<void>;
}) {
  const [name, setName] = useState(labelize(row.exercise_name));
  const [weight, setWeight] = useState<string>(
    row.default_weight_kg?.toString() ?? "",
  );
  const [sets, setSets] = useState<string>(row.default_sets?.toString() ?? "");
  const [reps, setReps] = useState<string>(row.default_reps?.toString() ?? "");
  const [bw, setBw] = useState(row.is_bodyweight_base);

  useEffect(() => {
    setName(labelize(row.exercise_name));
    setWeight(row.default_weight_kg?.toString() ?? "");
    setSets(row.default_sets?.toString() ?? "");
    setReps(row.default_reps?.toString() ?? "");
    setBw(row.is_bodyweight_base);
  }, [
    row.id,
    row.exercise_name,
    row.default_weight_kg,
    row.default_sets,
    row.default_reps,
    row.is_bodyweight_base,
  ]);

  function commitName() {
    const normalized = normalize(name) || row.exercise_name;
    if (normalized !== row.exercise_name) {
      onPatch({ exercise_name: normalized });
    }
  }
  function commitWeight() {
    const next = weight === "" ? null : parseFloat(weight);
    if (next !== row.default_weight_kg) {
      onPatch({ default_weight_kg: next });
    }
  }
  function commitSets() {
    const next = sets === "" ? null : parseInt(sets, 10);
    if (next !== row.default_sets) {
      onPatch({ default_sets: next });
    }
  }
  function commitReps() {
    const next = reps === "" ? null : parseInt(reps, 10);
    if (next !== row.default_reps) {
      onPatch({ default_reps: next });
    }
  }
  function commitBw(next: boolean) {
    setBw(next);
    if (next !== row.is_bodyweight_base) {
      onPatch({ is_bodyweight_base: next });
    }
  }

  const suggestions = useMemo(
    () => filterCatalog(row.workout_type, name, 6),
    [row.workout_type, name],
  );
  const showSuggestions =
    name.trim().length > 0 &&
    !suggestions.some(
      (s) =>
        s.label.toLowerCase() === name.trim().toLowerCase() ||
        s.name === normalize(name),
    );

  const idx = siblings.findIndex((s) => s.id === row.id);
  const canMoveUp = idx > 0;
  const canMoveDown = idx >= 0 && idx < siblings.length - 1;
  const timed = isTimedExerciseName(normalize(name));

  return (
    <Sheet open onClose={onClose} title="Edit exercise">
      <div className="space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            placeholder="e.g. Incline chest press"
            className="w-full bg-neutral-800 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setName(s.label);
                    commitBw(!!s.bodyweightBase);
                    onPatch({
                      exercise_name: s.name,
                      is_bodyweight_base: !!s.bodyweightBase,
                    });
                  }}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Bodyweight movement</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Pull-ups, dips, planks. Weight below = added load only.
            </div>
          </div>
          <Toggle
            checked={bw}
            onChange={commitBw}
            ariaLabel="Bodyweight movement"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label={bw ? "Added kg" : "kg"}
            value={weight}
            onChange={setWeight}
            onBlur={commitWeight}
            step="0.5"
            placeholder={bw ? "0" : "kg"}
          />
          <NumberField
            label="Sets"
            value={sets}
            onChange={setSets}
            onBlur={commitSets}
            step="1"
            placeholder="3"
          />
          <NumberField
            label={timed ? "Seconds" : "Reps"}
            value={reps}
            onChange={setReps}
            onBlur={commitReps}
            step="1"
            placeholder={timed ? "60" : "8"}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            className="flex items-center justify-center gap-1.5 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            <ChevronUpIcon className="w-4 h-4" />
            Move up
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            className="flex items-center justify-center gap-1.5 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            <ChevronDownIcon className="w-4 h-4" />
            Move down
          </button>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-red-900/60 text-red-400 hover:bg-red-950/40 active:bg-red-900/40 text-sm font-medium"
        >
          <TrashIcon className="w-4 h-4" />
          Delete exercise
        </button>
      </div>
    </Sheet>
  );
}

function AddSheet({
  type,
  onClose,
  onAdd,
}: {
  type: string;
  onClose: () => void;
  onAdd: (
    name: string,
    weight: string,
    sets: string,
    reps: string,
    bw: boolean,
  ) => Promise<void>;
}) {
  const [display, setDisplay] = useState("");
  const [picked, setPicked] = useState<CatalogExercise | null>(null);
  const [weight, setWeight] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8");
  const [bw, setBw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const suggestions = useMemo(
    () => filterCatalog(type, display, 12),
    [type, display],
  );

  function pick(s: CatalogExercise) {
    setPicked(s);
    setDisplay(s.label);
    setBw(!!s.bodyweightBase);
    if (s.timed) setReps((r) => (r === "8" ? "60" : r));
  }

  function onDisplayChange(value: string) {
    setDisplay(value);
    if (picked && value !== picked.label) setPicked(null);
  }

  async function submit() {
    if (!display.trim() || submitting) return;
    setSubmitting(true);
    const name = picked ? picked.name : normalize(display);
    await onAdd(name, weight, sets, reps, bw);
    setSubmitting(false);
  }

  const previewLabel = display.trim()
    ? picked
      ? picked.label
      : labelize(normalize(display))
    : "";
  const timed =
    picked?.timed ?? isTimedExerciseName(normalize(display || ""));

  return (
    <Sheet open onClose={onClose} title={`Add to ${TYPE_LABEL[type] ?? type}`}>
      <div className="space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">
            Exercise
          </label>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              value={display}
              onChange={(e) => onDisplayChange(e.target.value)}
              placeholder="Search or type a name…"
              autoFocus
              className="w-full bg-neutral-800 rounded-lg pl-9 pr-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
            />
          </div>
        </div>

        {suggestions.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mb-1.5 px-1">
              {display.trim() ? "Matching" : "Common"}
            </div>
            <ul className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950/40 max-h-56 overflow-y-auto">
              {suggestions.map((s) => {
                const active = picked?.name === s.name;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 border-b border-neutral-800 last:border-b-0 ${
                        active
                          ? "bg-emerald-500/15 text-white"
                          : "hover:bg-neutral-800/60 active:bg-neutral-800"
                      }`}
                    >
                      <span className="truncate text-sm">{s.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {s.timed && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                            Timed
                          </span>
                        )}
                        {s.bodyweightBase && !s.timed && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                            BW
                          </span>
                        )}
                        {active && (
                          <CheckIcon className="w-4 h-4 text-emerald-400" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Bodyweight movement</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Weight below = added load (belt, vest) only.
            </div>
          </div>
          <Toggle checked={bw} onChange={setBw} ariaLabel="Bodyweight movement" />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label={bw ? "Added kg" : "kg"}
            value={weight}
            onChange={setWeight}
            step="0.5"
            placeholder={bw ? "0" : "kg"}
          />
          <NumberField
            label="Sets"
            value={sets}
            onChange={setSets}
            step="1"
            placeholder="3"
          />
          <NumberField
            label={timed ? "Seconds" : "Reps"}
            value={reps}
            onChange={setReps}
            step="1"
            placeholder={timed ? "60" : "8"}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!display.trim() || submitting}
          className="w-full py-3.5 rounded-lg bg-white text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:bg-neutral-200"
        >
          {submitting ? "Adding…" : previewLabel ? `Add ${previewLabel}` : "Add exercise"}
        </button>
      </div>
    </Sheet>
  );
}

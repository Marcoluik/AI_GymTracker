import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isTimedExerciseName } from "../data/exerciseCatalog";
import Sheet from "../components/Sheet";
import Toggle from "../components/Toggle";
import {
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  GripIcon,
} from "../components/icons";

type Row = {
  id: number;
  workout_type: string;
  exercise_name: string;
  exercise_id: string | null;
  default_weight_kg: number | null;
  default_sets: number | null;
  default_reps: number | null;
  display_order: number;
  is_bodyweight_base: boolean;
  per_set_weights: number[] | null;
  to_failure: boolean;
  warmup_enabled: boolean;
};

type ProgramFromDb = Omit<Row, "is_bodyweight_base" | "to_failure" | "warmup_enabled"> & {
  is_bodyweight_base?: boolean | null;
  to_failure?: boolean | null;
  warmup_enabled?: boolean | null;
  exercise_id?: string | null;
};

// Survives tab switches: the page renders instantly from the last fetch while
// a fresh load runs in the background.
let programCache: Row[] | null = null;

const TYPES = ["chest", "back", "legs", "abs"] as const;
const TYPE_LABEL: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  abs: "Abs",
};

function labelize(name: string) {
  const clean = name.replace(/_custom_\d+$/, "");
  const s = clean.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function repsLabel(row: Row): string {
  if (row.to_failure) return "failure";
  const reps = row.default_reps;
  if (reps === null || reps === undefined) return "—";
  return isTimedExerciseName(row.exercise_name) ? `${reps}s` : `${reps} reps`;
}

function rowSummary(row: Row): string {
  const parts: string[] = [];
  if (row.default_sets) parts.push(`${row.default_sets} sets`);
  parts.push(repsLabel(row));
  if (row.is_bodyweight_base) {
    parts.push(
      row.default_weight_kg && row.default_weight_kg > 0
        ? `BW + ${row.default_weight_kg} kg`
        : "BW",
    );
  } else if (row.per_set_weights && row.per_set_weights.length > 0) {
    parts.push(`${row.per_set_weights.join(" / ")} kg`);
  } else if (row.default_weight_kg !== null) {
    parts.push(`${row.default_weight_kg} kg`);
  }
  if (row.warmup_enabled && smartWarmupCandidate(row)) parts.push("warmup");
  return parts.join(" · ");
}

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function smartWarmupCandidate(row: Row): boolean {
  if (row.to_failure) return false;
  if (isTimedExerciseName(row.exercise_name)) return false;
  const weights = (row.per_set_weights && row.per_set_weights.length > 0
    ? row.per_set_weights
    : row.default_weight_kg !== null
      ? [row.default_weight_kg]
      : [])
    .filter((w) => Number.isFinite(w));
  const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
  if (row.is_bodyweight_base && maxWeight > 0) return true;
  if (maxWeight < 20) return false;
  if (/(curl|extension|raise|fly|flies|face_pull|abductor|adductor|calf|crunch|twist)/.test(row.exercise_name) && maxWeight < 80) {
    return false;
  }
  return /(squat|deadlift|press|row|pull|pulldown|dip|thrust|bench)/.test(row.exercise_name) || maxWeight >= 80;
}

export default function Program() {
  const [rows, setRows] = useState<Row[]>(programCache ?? []);
  const [progressing, setProgressing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(programCache === null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);

  // After rows load, compute which exercises are progressing
  // (last 3 sessions strictly increasing max weight)
  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    (async () => {
      const names = [...new Set(rows.map((r) => r.exercise_name))];
      const { data } = await supabase
        .from("sets")
        .select("*, workouts!inner(date)")
        .in("exercise_name", names)
        .eq("skipped", false)
        .not("weight_kg", "is", null)
        .gt("weight_kg", 0);
      if (cancelled) return;

      type Row = {
        exercise_name: string;
        weight_kg: number;
        workout_id: string;
        is_warmup?: boolean;
        workouts: { date: string } | { date: string }[];
      };
      // exercise → date → maxWeight
      const byExercise = new Map<string, Map<string, number>>();
      for (const r of (data ?? []) as Row[]) {
        if (r.is_warmup) continue;
        const date = Array.isArray(r.workouts) ? r.workouts[0]?.date : r.workouts?.date;
        if (!date) continue;
        const m = byExercise.get(r.exercise_name) ?? new Map<string, number>();
        const cur = m.get(date) ?? 0;
        if (r.weight_kg > cur) m.set(date, r.weight_kg);
        byExercise.set(r.exercise_name, m);
      }

      const out = new Set<string>();
      for (const [name, dm] of byExercise) {
        const recent = [...dm.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 3);
        if (recent.length < 3) continue;
        // recent[0] is most recent
        if (recent[0][1] > recent[1][1] && recent[1][1] > recent[2][1]) {
          out.add(name);
        }
      }
      setProgressing(out);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  async function load() {
    const { data, error } = await supabase
      .from("program")
      .select("*")
      .order("workout_type")
      .order("display_order");
    if (error) setError(error.message);
    else {
      const raw = (data ?? []) as ProgramFromDb[];
      const mapped = raw.map((r) => ({
        ...r,
        is_bodyweight_base: !!r.is_bodyweight_base,
        to_failure: !!r.to_failure,
        warmup_enabled: r.warmup_enabled !== false,
        per_set_weights: r.per_set_weights ?? null,
        exercise_id: r.exercise_id ?? null,
      }));
      programCache = mapped;
      setRows(mapped);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
    exerciseId: string | null,
    weight: string,
    sets: string,
    reps: string,
    isBodyweightBase: boolean,
    toFailure: boolean,
    warmupEnabled: boolean,
    perSetWeights: number[] | null,
  ) {
    const trimmed = normalize(name);
    if (!trimmed) { alert("Exercise name required"); return; }
    const typeRows = rows.filter((r) => r.workout_type === type);
    const maxOrder = typeRows.reduce((m, r) => Math.max(m, r.display_order), 0);
    const { error } = await supabase.from("program").insert({
      workout_type: type,
      exercise_name: trimmed,
      exercise_id: exerciseId,
      default_weight_kg: weight === "" ? null : parseFloat(weight),
      default_sets: sets === "" ? null : parseInt(sets, 10),
      default_reps: toFailure ? null : (reps === "" ? null : parseInt(reps, 10)),
      display_order: maxOrder + 1,
      is_bodyweight_base: isBodyweightBase,
      to_failure: toFailure,
      warmup_enabled: warmupEnabled,
      per_set_weights: perSetWeights && perSetWeights.length > 0 ? perSetWeights : null,
    });
    if (error) alert(error.message);
    else await load();
  }

  async function reorderSection(ordered: Row[]) {
    const results = await Promise.all(
      ordered.map((r, i) =>
        supabase.from("program").update({ display_order: i + 1 }).eq("id", r.id),
      ),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      alert(`Couldn't save new order: ${failed[0].error?.message ?? "unknown error"}`);
    }
    await load();
  }

  if (loading)
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-neutral-900/60 border border-neutral-900 animate-pulse" />
        ))}
      </div>
    );
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div className="space-y-6 pb-4">
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
                <p className="px-4 py-6 text-center text-sm text-neutral-500">No exercises yet</p>
              ) : (
                <DraggableList
                  rows={typeRows}
                  onReorder={reorderSection}
                  onTap={setEditing}
                  onPatch={updateRow}
                  progressing={progressing}
                />
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
          onClose={() => setEditing(null)}
          onPatch={(patch) => updateRow(editing.id, patch)}
          onDelete={async () => {
            if (!confirm(`Delete "${labelize(editing.exercise_name)}"?`)) return;
            await deleteRow(editing.id);
            setEditing(null);
          }}
        />
      )}
      {addingType && (
        <AddSheet
          type={addingType}
          onClose={() => setAddingType(null)}
          onAdd={async (name, exerciseId, weight, sets, reps, bw, toFailure, warmupEnabled, psw) => {
            await addRow(addingType, name, exerciseId, weight, sets, reps, bw, toFailure, warmupEnabled, psw);
            setAddingType(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Draggable list ───────────────────────────────────────────────────────────

function DraggableList({
  rows,
  onReorder,
  onTap,
  onPatch,
  progressing,
}: {
  rows: Row[];
  onReorder: (ordered: Row[]) => Promise<void>;
  onTap: (row: Row) => void;
  onPatch: (id: number, patch: Partial<Row>) => Promise<void>;
  progressing: Set<string>;
}) {
  const [items, setItems] = useState(rows);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const itemEls = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => { setItems(rows); }, [rows]);

  function setRef(id: number, el: HTMLDivElement | null) {
    if (el) itemEls.current.set(id, el);
    else itemEls.current.delete(id);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, id: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingId === null) return;
    const currentIdx = items.findIndex((r) => r.id === draggingId);
    for (const [id, el] of itemEls.current) {
      if (id === draggingId) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const targetIdx = items.findIndex((r) => r.id === id);
      if (
        (e.clientY < mid && targetIdx < currentIdx) ||
        (e.clientY > mid && targetIdx > currentIdx)
      ) {
        const next = [...items];
        const [dragged] = next.splice(currentIdx, 1);
        next.splice(targetIdx, 0, dragged);
        setItems(next);
        break;
      }
    }
  }

  function onPointerUp() {
    if (draggingId === null) return;
    setDraggingId(null);
    onReorder(items);
  }

  return (
    <>
      {items.map((r) => (
        <div
          key={r.id}
          ref={(el) => setRef(r.id, el)}
          className={`flex items-center border-b border-neutral-800 last:border-b-0 transition-opacity ${
            r.id === draggingId ? "opacity-40" : "opacity-100"
          }`}
        >
          <div
            onPointerDown={(e) => onPointerDown(e, r.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="pl-4 pr-2 py-4 touch-none cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 shrink-0"
          >
            <GripIcon className="w-4 h-4" />
          </div>
          <button
            type="button"
            onClick={() => r.id !== draggingId && onTap(r)}
            className="flex-1 flex items-center gap-3 py-3.5 text-left min-w-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[15px] truncate">{labelize(r.exercise_name)}</span>
                {progressing.has(r.exercise_name) && (
                  <span
                    title="3 sessions in a row of increasing weight"
                    className="shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400"
                  >
                    ↑ 3
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 truncate">{rowSummary(r)}</div>
            </div>
          </button>
          <QuickAdjust row={r} onPatch={(patch) => onPatch(r.id, patch)} />
          <button
            type="button"
            onClick={() => r.id !== draggingId && onTap(r)}
            className="pr-4 pl-2 py-4 text-neutral-600 hover:text-neutral-300 shrink-0"
            aria-label={`Edit ${labelize(r.exercise_name)}`}
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </>
  );
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function nudgeWeightPatch(row: Row, delta: number): Partial<Row> {
  const patch: Partial<Row> = {};
  if (row.default_weight_kg !== null) {
    patch.default_weight_kg = roundOne(Math.max(0, row.default_weight_kg + delta));
  }
  if (row.per_set_weights && row.per_set_weights.length > 0) {
    patch.per_set_weights = row.per_set_weights.map((w) => roundOne(Math.max(0, w + delta)));
  }
  return patch;
}

function quickWeightLabel(row: Row): string {
  if (row.per_set_weights && row.per_set_weights.length > 0) {
    const min = Math.min(...row.per_set_weights);
    const max = Math.max(...row.per_set_weights);
    return min === max ? `${formatKg(min)} kg` : `${formatKg(min)}-${formatKg(max)} kg`;
  }
  if (row.default_weight_kg !== null) {
    return row.is_bodyweight_base && row.default_weight_kg === 0
      ? "BW"
      : `${formatKg(row.default_weight_kg)} kg`;
  }
  return "kg";
}

function QuickAdjust({
  row,
  onPatch,
}: {
  row: Row;
  onPatch: (patch: Partial<Row>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const hasWeight =
    row.default_weight_kg !== null ||
    !!(row.per_set_weights && row.per_set_weights.length > 0);
  const canAdjustReps = !hasWeight && !row.to_failure && row.default_reps !== null;

  if (!hasWeight && !canAdjustReps) return null;

  const step = hasWeight ? (row.is_bodyweight_base ? 1 : 2.5) : (isTimedExerciseName(row.exercise_name) ? 5 : 1);
  const label = hasWeight
    ? quickWeightLabel(row)
    : `${row.default_reps}${isTimedExerciseName(row.exercise_name) ? "s" : " reps"}`;

  async function nudge(delta: number) {
    if (saving) return;
    const patch = hasWeight
      ? nudgeWeightPatch(row, delta)
      : { default_reps: Math.max(1, (row.default_reps ?? 1) + delta) };
    setSaving(true);
    try {
      await onPatch(patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-950/50 overflow-hidden shrink-0 mr-1">
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={saving}
        className="w-8 h-9 flex items-center justify-center text-neutral-300 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-40"
        aria-label={`Decrease ${labelize(row.exercise_name)}`}
      >
        -
      </button>
      <span className="min-w-[4.25rem] h-9 px-2 flex items-center justify-center text-[11px] font-semibold text-neutral-300 border-x border-neutral-800">
        {label}
      </span>
      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={saving}
        className="w-8 h-9 flex items-center justify-center text-neutral-300 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-40"
        aria-label={`Increase ${labelize(row.exercise_name)}`}
      >
        <PlusIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Shared field components ──────────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  onStep,
  placeholder,
  step,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onStep?: (delta: number) => void;
  placeholder?: string;
  step?: string;
  disabled?: boolean;
}) {
  const stepValue = parseFloat(step ?? "1") || 1;
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold block mb-1.5">
        {label}
      </label>
      <div className="flex overflow-hidden rounded-lg bg-neutral-800 focus-within:ring-2 focus-within:ring-neutral-600">
        {onStep && (
          <button
            type="button"
            onClick={() => onStep(-stepValue)}
            disabled={disabled}
            className="w-10 shrink-0 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
            aria-label={`Decrease ${label}`}
          >
            -
          </button>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base text-center focus:outline-none placeholder-neutral-500 disabled:opacity-40"
        />
        {onStep && (
          <button
            type="button"
            onClick={() => onStep(stepValue)}
            disabled={disabled}
            className="w-10 shrink-0 flex items-center justify-center text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
            aria-label={`Increase ${label}`}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Edit sheet ───────────────────────────────────────────────────────────────

function EditSheet({
  row,
  onClose,
  onPatch,
  onDelete,
}: {
  row: Row;
  onClose: () => void;
  onPatch: (patch: Partial<Row>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(labelize(row.exercise_name));
  const [weight, setWeight] = useState(row.default_weight_kg?.toString() ?? "");
  const [sets, setSets] = useState(row.default_sets?.toString() ?? "");
  const [reps, setReps] = useState(row.default_reps?.toString() ?? "");
  const [bw, setBw] = useState(row.is_bodyweight_base);
  const [toFailure, setToFailure] = useState(row.to_failure);
  const [warmupEnabled, setWarmupEnabled] = useState(row.warmup_enabled);
  const [perSetMode, setPerSetMode] = useState(!!(row.per_set_weights && row.per_set_weights.length > 0));
  const [perSetWeights, setPerSetWeights] = useState<string[]>(() => {
    if (row.per_set_weights && row.per_set_weights.length > 0)
      return row.per_set_weights.map(String);
    const n = row.default_sets ?? 3;
    const base = row.default_weight_kg?.toString() ?? "";
    return Array.from({ length: n }, () => base);
  });

  useEffect(() => {
    setName(labelize(row.exercise_name));
    setWeight(row.default_weight_kg?.toString() ?? "");
    setSets(row.default_sets?.toString() ?? "");
    setReps(row.default_reps?.toString() ?? "");
    setBw(row.is_bodyweight_base);
    setToFailure(row.to_failure);
    setWarmupEnabled(row.warmup_enabled);
    const hasPsw = !!(row.per_set_weights && row.per_set_weights.length > 0);
    setPerSetMode(hasPsw);
    const n = row.default_sets ?? 3;
    setPerSetWeights(
      hasPsw
        ? row.per_set_weights!.map(String)
        : Array.from({ length: n }, () => row.default_weight_kg?.toString() ?? ""),
    );
  }, [row.id]);

  function commitName() {
    const normalized = normalize(name) || row.exercise_name;
    if (normalized !== row.exercise_name) onPatch({ exercise_name: normalized });
  }
  function commitWeight() {
    const next = weight === "" ? null : parseFloat(weight);
    if (next !== row.default_weight_kg) onPatch({ default_weight_kg: next });
  }
  function commitSets() {
    const next = sets === "" ? null : parseInt(sets, 10);
    if (next !== row.default_sets) {
      if (perSetMode && next) {
        setPerSetWeights((prev) => {
          const arr = Array.from({ length: next }, (_, i) => prev[i] ?? prev[prev.length - 1] ?? "");
          return arr;
        });
      }
      onPatch({ default_sets: next });
    }
  }
  function commitReps() {
    const next = reps === "" ? null : parseInt(reps, 10);
    if (next !== row.default_reps) onPatch({ default_reps: next });
  }
  function commitBw(next: boolean) {
    setBw(next);
    if (next !== row.is_bodyweight_base) onPatch({ is_bodyweight_base: next });
  }
  function commitToFailure(next: boolean) {
    setToFailure(next);
    onPatch({ to_failure: next, default_reps: next ? null : (reps === "" ? null : parseInt(reps, 10)) });
  }
  function commitWarmupEnabled(next: boolean) {
    setWarmupEnabled(next);
    if (next !== row.warmup_enabled) onPatch({ warmup_enabled: next });
  }
  function commitPerSetMode(next: boolean) {
    setPerSetMode(next);
    if (next) {
      const n = parseInt(sets, 10) || row.default_sets || 3;
      const base = weight !== "" ? weight : (row.default_weight_kg?.toString() ?? "");
      const arr = Array.from({ length: n }, (_, i) => perSetWeights[i] ?? base);
      setPerSetWeights(arr);
      onPatch({ per_set_weights: arr.map((v) => (v === "" ? 0 : parseFloat(v))) });
    } else {
      setPerSetWeights([]);
      onPatch({ per_set_weights: null });
    }
  }
  function commitPerSetWeight(index: number, value: string) {
    const next = [...perSetWeights];
    next[index] = value;
    setPerSetWeights(next);
    onPatch({ per_set_weights: next.map((v) => (v === "" ? 0 : parseFloat(v))) });
  }
  function stepWeight(delta: number) {
    const base = weight === "" ? (row.default_weight_kg ?? 0) : parseFloat(weight);
    const next = roundOne(Math.max(0, (isNaN(base) ? 0 : base) + delta));
    setWeight(String(next));
    onPatch({ default_weight_kg: next });
  }
  function stepSets(delta: number) {
    const base = parseInt(sets, 10) || row.default_sets || 3;
    const next = Math.max(1, base + delta);
    setSets(String(next));
    if (perSetMode) {
      setPerSetWeights((prev) =>
        Array.from({ length: next }, (_, i) => prev[i] ?? prev[prev.length - 1] ?? ""),
      );
    }
    onPatch({ default_sets: next });
  }
  function stepReps(delta: number) {
    const base = parseInt(reps, 10) || row.default_reps || 1;
    const next = Math.max(1, base + delta);
    setReps(String(next));
    onPatch({ default_reps: next });
  }

  const timed = isTimedExerciseName(normalize(name));
  const numSets = parseInt(sets, 10) || row.default_sets || 3;
  const currentRow: Row = {
    ...row,
    exercise_name: normalize(name) || row.exercise_name,
    default_weight_kg: weight === "" ? null : parseFloat(weight),
    default_sets: sets === "" ? null : parseInt(sets, 10),
    default_reps: toFailure ? null : (reps === "" ? null : parseInt(reps, 10)),
    is_bodyweight_base: bw,
    to_failure: toFailure,
    warmup_enabled: warmupEnabled,
    per_set_weights: perSetMode
      ? perSetWeights.map((v) => (v === "" ? 0 : parseFloat(v)))
      : null,
  };
  const likelyWarmup = smartWarmupCandidate(currentRow);

  return (
    <Sheet open onClose={onClose} title="Edit exercise">
      <div className="space-y-5">
        {/* Last session + history graph */}
        <LastSessionHistory exerciseName={row.exercise_name} />

        <ViewProgressLink
          exerciseName={row.exercise_name}
          onNavigate={onClose}
        />

        {/* Name */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
              Name
            </label>
            {!row.exercise_id && (
              <span className="text-[10px] text-neutral-500">Custom</span>
            )}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            placeholder="e.g. Incline chest press"
            className="w-full bg-neutral-800 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
          />
        </div>

        {/* Bodyweight toggle */}
        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Bodyweight movement</div>
            <div className="text-xs text-neutral-500 mt-0.5">Pull-ups, dips, planks. Weight = added load only.</div>
          </div>
          <Toggle checked={bw} onChange={commitBw} ariaLabel="Bodyweight movement" />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Smart warmups</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {likelyWarmup ? "Adds warmup sets before working sets." : "Only kicks in when this is heavy enough."}
            </div>
          </div>
          <Toggle checked={warmupEnabled} onChange={commitWarmupEnabled} ariaLabel="Smart warmups" />
        </label>

        {/* Sets / Reps / Weight */}
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label={bw ? "Added kg" : "kg"}
            value={weight}
            onChange={setWeight}
            onBlur={commitWeight}
            onStep={stepWeight}
            step="0.5"
            placeholder={bw ? "0" : "kg"}
            disabled={perSetMode}
          />
          <NumberField
            label="Sets"
            value={sets}
            onChange={setSets}
            onBlur={commitSets}
            onStep={stepSets}
            step="1"
            placeholder="3"
          />
          {/* Reps with To Failure toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                {timed ? "Seconds" : "Reps"}
              </span>
              <button
                type="button"
                onClick={() => commitToFailure(!toFailure)}
                className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-colors ${
                  toFailure
                    ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40"
                    : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {toFailure ? "Failure ✓" : "To failure"}
              </button>
            </div>
            <div className="flex overflow-hidden rounded-lg bg-neutral-800 focus-within:ring-2 focus-within:ring-neutral-600">
              <button
                type="button"
                onClick={() => stepReps(timed ? -5 : -1)}
                disabled={toFailure}
                className="w-10 shrink-0 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
                aria-label={timed ? "Decrease seconds" : "Decrease reps"}
              >
                -
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                value={toFailure ? "" : reps}
                onChange={(e) => setReps(e.target.value)}
                onBlur={commitReps}
                placeholder={toFailure ? "—" : timed ? "60" : "8"}
                disabled={toFailure}
                className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base text-center focus:outline-none placeholder-neutral-500 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => stepReps(timed ? 5 : 1)}
                disabled={toFailure}
                className="w-10 shrink-0 flex items-center justify-center text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
                aria-label={timed ? "Increase seconds" : "Increase reps"}
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Per-set weights — only when sets > 1 and not bodyweight-only */}
        {numSets > 1 && (
          <div>
            <button
              type="button"
              onClick={() => commitPerSetMode(!perSetMode)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                perSetMode
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                  : "border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <span>Different weight per set</span>
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                perSetMode ? "bg-sky-500/20 text-sky-300" : "bg-neutral-700 text-neutral-500"
              }`}>
                {perSetMode ? "On" : "Off"}
              </span>
            </button>

            {perSetMode && (
              <div className="mt-2 space-y-2">
                {Array.from({ length: numSets }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500 w-10 shrink-0">Set {i + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={perSetWeights[i] ?? ""}
                      onChange={(e) => commitPerSetWeight(i, e.target.value)}
                      placeholder="kg"
                      className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-600"
                    />
                    <span className="text-xs text-neutral-600 w-4 shrink-0">kg</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete */}
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

// ─── Add sheet ────────────────────────────────────────────────────────────────

type LibraryExercise = {
  id: string;
  name: string;
  primary_muscles: string[];
  equipment: string | null;
  is_custom: boolean;
};

const TYPE_MUSCLES: Record<string, string[]> = {
  chest: ["chest"],
  back: ["lats", "middle back", "lower back", "traps"],
  legs: ["quadriceps", "hamstrings", "glutes", "calves"],
  abs: ["abdominals", "obliques"],
};

function AddSheet({
  type,
  onClose,
  onAdd,
}: {
  type: string;
  onClose: () => void;
  onAdd: (
    name: string,
    exerciseId: string | null,
    weight: string,
    sets: string,
    reps: string,
    bw: boolean,
    toFailure: boolean,
    warmupEnabled: boolean,
    perSetWeights: number[] | null,
  ) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<LibraryExercise | null>(null);
  const [weight, setWeight] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8");
  const [bw, setBw] = useState(false);
  const [toFailure, setToFailure] = useState(false);
  const [warmupEnabled, setWarmupEnabled] = useState(true);
  const [perSetMode, setPerSetMode] = useState(false);
  const [perSetWeights, setPerSetWeights] = useState<string[]>(["", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    let cancelled = false;
    debounce.current = setTimeout(async () => {
      setSearching(true);
      let q = supabase.from("exercise_library").select("id,name,primary_muscles,equipment,is_custom").limit(20);
      const words = search.trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        for (const word of words) q = q.ilike("name", `%${word}%`);
      } else {
        const muscles = TYPE_MUSCLES[type] ?? [];
        if (muscles.length > 0) q = q.overlaps("primary_muscles", muscles);
      }
      q = q.order("is_custom", { ascending: false }).order("name");
      const { data } = await q;
      if (cancelled) return;
      setResults((data as LibraryExercise[]) ?? []);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [search, type]);

  function pick(ex: LibraryExercise) {
    setPicked(ex);
    setSearch(ex.name);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (picked && value !== picked.name) setPicked(null);
  }

  function handleSetsChange(v: string) {
    setSets(v);
    if (perSetMode) {
      const n = parseInt(v, 10) || 3;
      setPerSetWeights((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? prev[prev.length - 1] ?? ""));
    }
  }

  function togglePerSetMode(next: boolean) {
    setPerSetMode(next);
    if (next) {
      const n = parseInt(sets, 10) || 3;
      setPerSetWeights(Array.from({ length: n }, () => weight));
    }
  }

  async function submit() {
    if (submitting || !search.trim()) return;
    setSubmitting(true);

    // Resolve to a library exercise even when the user didn't tap a result:
    // 1) Exact match in current results list, 2) DB lookup by exact name.
    let effective = picked;
    if (!effective) {
      const target = search.trim().toLowerCase();
      effective = results.find((r) => r.name.toLowerCase() === target) ?? null;
    }
    if (!effective) {
      const { data } = await supabase
        .from("exercise_library")
        .select("id,name,primary_muscles,equipment,is_custom")
        .ilike("name", search.trim())
        .limit(1);
      if (data && data.length > 0) effective = data[0] as LibraryExercise;
    }

    const finalName = effective ? effective.name : search.trim();
    const exerciseId = effective ? effective.id : null;
    const psw = perSetMode ? perSetWeights.map((v) => (v === "" ? 0 : parseFloat(v))) : null;
    await onAdd(finalName, exerciseId, weight, sets, reps, bw, toFailure, warmupEnabled, psw);
    setSubmitting(false);
  }

  const timed = isTimedExerciseName(picked ? picked.id : normalize(search));
  const numSets = parseInt(sets, 10) || 3;
  const previewLabel = picked ? picked.name : search.trim();
  const showList = !picked && results.length > 0;

  return (
    <Sheet open onClose={onClose} title={`Add to ${TYPE_LABEL[type] ?? type}`}>
      <div className="space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block mb-2">Exercise</label>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search exercise library…"
              autoFocus
              className="w-full bg-neutral-800 rounded-lg pl-9 pr-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-500"
            />
          </div>
        </div>

        {showList && (
          <ul className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950/40 max-h-48 overflow-y-auto">
            {searching && results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-neutral-500">Searching…</li>
            ) : results.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => pick(ex)}
                  className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 border-b border-neutral-800 last:border-b-0 hover:bg-neutral-800/60 active:bg-neutral-800"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{ex.name}</div>
                    {ex.equipment && <div className="text-[10px] text-neutral-500">{ex.equipment}</div>}
                  </div>
                  {ex.is_custom && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 shrink-0">Custom</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {(picked || search.trim()) && (
          <>
            <label className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Bodyweight movement</div>
                <div className="text-xs text-neutral-500 mt-0.5">Weight = added load (belt, vest) only.</div>
              </div>
              <Toggle checked={bw} onChange={setBw} ariaLabel="Bodyweight movement" />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Smart warmups</div>
                <div className="text-xs text-neutral-500 mt-0.5">Auto before working sets when useful.</div>
              </div>
              <Toggle checked={warmupEnabled} onChange={setWarmupEnabled} ariaLabel="Smart warmups" />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label={bw ? "Added kg" : "kg"}
                value={weight}
                onChange={setWeight}
                onStep={(delta) => {
                  const base = weight === "" ? 0 : parseFloat(weight);
                  setWeight(String(roundOne(Math.max(0, (isNaN(base) ? 0 : base) + delta))));
                }}
                step="0.5"
                placeholder={bw ? "0" : "kg"}
                disabled={perSetMode}
              />
              <NumberField
                label="Sets"
                value={sets}
                onChange={handleSetsChange}
                onStep={(delta) => {
                  const base = parseInt(sets, 10) || 3;
                  handleSetsChange(String(Math.max(1, base + delta)));
                }}
                step="1"
                placeholder="3"
              />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">{timed ? "Seconds" : "Reps"}</span>
                  <button type="button" onClick={() => setToFailure((v) => !v)}
                    className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-colors ${toFailure ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40" : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"}`}>
                    {toFailure ? "Failure ✓" : "To failure"}
                  </button>
                </div>
                <div className="flex overflow-hidden rounded-lg bg-neutral-800 focus-within:ring-2 focus-within:ring-neutral-600">
                  <button
                    type="button"
                    onClick={() => {
                      const base = parseInt(reps, 10) || (timed ? 60 : 8);
                      setReps(String(Math.max(1, base - (timed ? 5 : 1))));
                    }}
                    disabled={toFailure}
                    className="w-10 shrink-0 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
                    aria-label={timed ? "Decrease seconds" : "Decrease reps"}
                  >
                    -
                  </button>
                  <input type="number" inputMode="decimal" step="1" value={toFailure ? "" : reps} onChange={(e) => setReps(e.target.value)}
                    placeholder={toFailure ? "—" : timed ? "60" : "8"} disabled={toFailure}
                    className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base text-center focus:outline-none placeholder-neutral-500 disabled:opacity-40" />
                  <button
                    type="button"
                    onClick={() => {
                      const base = parseInt(reps, 10) || (timed ? 60 : 8);
                      setReps(String(base + (timed ? 5 : 1)));
                    }}
                    disabled={toFailure}
                    className="w-10 shrink-0 flex items-center justify-center text-neutral-300 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40"
                    aria-label={timed ? "Increase seconds" : "Increase reps"}
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {numSets > 1 && (
              <div>
                <button type="button" onClick={() => togglePerSetMode(!perSetMode)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${perSetMode ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"}`}>
                  <span>Different weight per set</span>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${perSetMode ? "bg-sky-500/20 text-sky-300" : "bg-neutral-700 text-neutral-500"}`}>{perSetMode ? "On" : "Off"}</span>
                </button>
                {perSetMode && (
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: numSets }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 w-10 shrink-0">Set {i + 1}</span>
                        <input type="number" inputMode="decimal" step="0.5" value={perSetWeights[i] ?? ""}
                          onChange={(e) => { const next = [...perSetWeights]; next[i] = e.target.value; setPerSetWeights(next); }}
                          placeholder="kg"
                          className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-neutral-600 placeholder-neutral-600" />
                        <span className="text-xs text-neutral-600 w-4 shrink-0">kg</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <button type="button" onClick={submit} disabled={!search.trim() || submitting}
          className="w-full py-3.5 rounded-lg bg-white text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:bg-neutral-200">
          {submitting ? "Adding…" : previewLabel ? `Add ${previewLabel}` : "Add exercise"}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Last session + history chart ─────────────────────────────────────────────

type SessionStat = { date: string; maxWeight: number; repsAtMax: number; volume: number; nSets: number };

function LastSessionHistory({ exerciseName }: { exerciseName: string }) {
  const [sessions, setSessions] = useState<SessionStat[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sets")
        .select("*, workouts!inner(date)")
        .eq("exercise_name", exerciseName);
      const rows = (data ?? []) as {
        weight_kg: number | null;
        reps: number | null;
        skipped: boolean;
        workout_id: string;
        is_warmup?: boolean;
        workouts: { date: string } | { date: string }[];
      }[];

      const byDate = new Map<string, { weight: number; reps: number }[]>();
      for (const r of rows) {
        if (r.skipped || r.is_warmup) continue;
        const date = Array.isArray(r.workouts) ? r.workouts[0]?.date : r.workouts?.date;
        if (!date) continue;
        const list = byDate.get(date) ?? [];
        list.push({ weight: r.weight_kg ?? 0, reps: r.reps ?? 0 });
        byDate.set(date, list);
      }

      const stats: SessionStat[] = [...byDate.entries()]
        .map(([date, sets]) => {
          const maxWeight = Math.max(...sets.map((s) => s.weight));
          const repsAtMax = sets.find((s) => s.weight === maxWeight)?.reps ?? 0;
          const volume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
          return { date, maxWeight, repsAtMax, volume, nSets: sets.length };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      setSessions(stats);
    })();
  }, [exerciseName]);

  if (sessions === null) return null;
  if (sessions.length === 0) return null;

  const last = sessions[0];
  const daysAgo = Math.floor(
    (Date.now() - new Date(last.date + "T12:00:00").getTime()) / 86_400_000,
  );
  const whenLabel = daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`;
  const lastLabel = `${last.maxWeight} kg × ${last.repsAtMax} · ${last.nSets} ${last.nSets === 1 ? "set" : "sets"}`;

  const recent = sessions.slice(0, 10).reverse(); // chronological for chart

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-800/40 transition-colors"
      >
        <span className="text-[11px] text-neutral-500 min-w-0">
          Last:{" "}
          <span className="text-neutral-300">{lastLabel}</span>
          <span className="text-neutral-600"> · {whenLabel}</span>
        </span>
        {recent.length > 1 && (
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-neutral-600 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {expanded && recent.length > 1 && (
        <div className="border-t border-neutral-800 px-3 py-3">
          <ProgressChart sessions={recent} />
        </div>
      )}
    </div>
  );
}

function ProgressChart({ sessions }: { sessions: SessionStat[] }) {
  const w = 280, h = 90, pad = 10;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const weights = sessions.map((s) => s.maxWeight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(max - min, 1);

  const points = sessions.map((s, i) => {
    const x = pad + (i / Math.max(sessions.length - 1, 1)) * innerW;
    const y = pad + (1 - (s.maxWeight - min) / range) * innerH;
    return { x, y, weight: s.maxWeight };
  });

  // Mark each running-max as a PR point
  let runMax = -Infinity;
  const isPR = points.map((p) => {
    const yes = p.weight > runMax;
    if (yes) runMax = p.weight;
    return yes;
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-neutral-500 mb-2">
        <span>Max weight · last {sessions.length} sessions</span>
        <span className="text-neutral-600 normal-case tracking-normal font-normal">
          {min} – {max} kg
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <path d={path} stroke="#737373" fill="none" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isPR[i] ? 3.5 : 2.5}
            fill={isPR[i] ? "#22c55e" : "#a3a3a3"}
          />
        ))}
      </svg>
    </div>
  );
}

function ViewProgressLink({
  exerciseName,
  onNavigate,
}: {
  exerciseName: string;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        navigate(`/exercise/${encodeURIComponent(exerciseName)}`);
        onNavigate();
      }}
      className="w-full text-center text-xs font-medium text-neutral-400 hover:text-white py-2"
    >
      View full progress →
    </button>
  );
}

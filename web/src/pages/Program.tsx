import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: number;
  workout_type: string;
  exercise_name: string;
  default_weight_kg: number | null;
  display_order: number;
};

const TYPES = ["chest", "back", "legs"];

export default function Program() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("program")
      .select("*")
      .order("workout_type")
      .order("display_order");
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRow(id: number, patch: Partial<Row>) {
    const { error } = await supabase.from("program").update(patch).eq("id", id);
    if (error) alert(error.message);
    else load();
  }

  async function deleteRow(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const { error } = await supabase.from("program").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  }

  async function addRow(
    type: string,
    name: string,
    weight: string,
    afterOrder: number,
  ) {
    if (!name.trim()) {
      alert("Exercise name required");
      return;
    }
    const { error } = await supabase.from("program").insert({
      workout_type: type,
      exercise_name: name.trim(),
      default_weight_kg: weight === "" ? null : parseFloat(weight),
      display_order: afterOrder + 1,
    });
    if (error) alert(error.message);
    else load();
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div className="space-y-6 pb-12">
      {TYPES.map((type) => {
        const typeRows = rows.filter((r) => r.workout_type === type);
        const maxOrder = typeRows.reduce(
          (m, r) => Math.max(m, r.display_order),
          0,
        );
        return (
          <section key={type}>
            <h2 className="text-base font-semibold capitalize mb-2 px-1">
              {type}
            </h2>
            <div className="rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900">
              {typeRows.map((r) => (
                <RowEditor
                  key={r.id}
                  row={r}
                  onSave={updateRow}
                  onDelete={deleteRow}
                />
              ))}
              <AddRow
                type={type}
                onAdd={(name, weight) => addRow(type, name, weight, maxOrder)}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RowEditor({
  row,
  onSave,
  onDelete,
}: {
  row: Row;
  onSave: (id: number, patch: Partial<Row>) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [name, setName] = useState(row.exercise_name);
  const [weight, setWeight] = useState<string>(
    row.default_weight_kg?.toString() ?? "",
  );

  function save() {
    const newWeight = weight === "" ? null : parseFloat(weight);
    if (name !== row.exercise_name || newWeight !== row.default_weight_kg) {
      onSave(row.id, { exercise_name: name, default_weight_kg: newWeight });
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 last:border-b-0">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={weight}
        placeholder="bw"
        onChange={(e) => setWeight(e.target.value)}
        onBlur={save}
        className="w-16 bg-transparent text-sm text-right focus:outline-none placeholder-neutral-600"
      />
      <span className="text-xs text-neutral-500 w-5 text-right">kg</span>
      <button
        onClick={() => onDelete(row.id, row.exercise_name)}
        className="text-neutral-500 hover:text-red-400 text-xl w-6 leading-none"
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}

function AddRow({
  type,
  onAdd,
}: {
  type: string;
  onAdd: (name: string, weight: string) => void;
}) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-950">
      <input
        placeholder={`add to ${type}…`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 bg-transparent text-sm placeholder-neutral-600 focus:outline-none min-w-0"
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        placeholder="kg"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-16 bg-transparent text-sm text-right placeholder-neutral-600 focus:outline-none"
      />
      <span className="text-xs text-neutral-500 w-5 text-right">kg</span>
      <button
        onClick={() => {
          onAdd(name, weight);
          setName("");
          setWeight("");
        }}
        className="text-neutral-400 hover:text-white text-xl w-6 leading-none"
        aria-label="Add"
      >
        +
      </button>
    </div>
  );
}

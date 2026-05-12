/** Curated suggestions for program editor (snake_case ids). Type any custom name; this is autocomplete only. */

export type CatalogExercise = {
  name: string;
  label: string;
  /** When true, picking this sets "bodyweight base" — weight field = added load (belt/plate) */
  bodyweightBase?: boolean;
  /** When true, the rep count represents seconds held (planks, hollow holds). UI displays "60s" rather than "× 60". */
  timed?: boolean;
};

const chest: CatalogExercise[] = [
  { name: "incline_chest_press", label: "Incline chest press" },
  { name: "flat_bench_press", label: "Flat bench press" },
  { name: "decline_bench_press", label: "Decline bench press" },
  { name: "dumbbell_press", label: "Dumbbell bench press" },
  { name: "incline_dumbbell_press", label: "Incline dumbbell press" },
  { name: "cable_flies", label: "Cable flyes" },
  { name: "pec_deck", label: "Pec deck" },
  { name: "push_ups", label: "Push-ups", bodyweightBase: true },
  { name: "dips", label: "Chest dips", bodyweightBase: true },
  { name: "shoulder_press", label: "Shoulder press" },
  { name: "arnold_press", label: "Arnold press" },
  { name: "lateral_raises", label: "Lateral raises" },
  { name: "front_raises", label: "Front raises" },
  { name: "rear_delt_fly", label: "Rear delt fly" },
];

const back: CatalogExercise[] = [
  { name: "pull_ups", label: "Pull-ups / chin-ups", bodyweightBase: true },
  { name: "lat_pulldown", label: "Lat pulldown" },
  { name: "neutral_grip_pulldown", label: "Neutral grip pulldown" },
  { name: "straight_arm_pulldown", label: "Straight arm pulldown" },
  { name: "seated_cable_row", label: "Seated cable row" },
  { name: "one_arm_dumbbell_row", label: "One-arm dumbbell row" },
  { name: "barbell_row", label: "Barbell row" },
  { name: "pendlay_row", label: "Pendlay row" },
  { name: "t_bar_row", label: "T-bar row" },
  { name: "chest_supported_row", label: "Chest-supported row" },
  { name: "face_pulls", label: "Face pulls" },
  { name: "reverse_fly", label: "Reverse fly" },
  { name: "shrugs", label: "Shrugs" },
  { name: "deadlift", label: "Deadlift" },
];

const legs: CatalogExercise[] = [
  { name: "squat", label: "Back squat" },
  { name: "front_squat", label: "Front squat" },
  { name: "goblet_squat", label: "Goblet squat" },
  { name: "leg_press", label: "Leg press" },
  { name: "hack_squat", label: "Hack squat" },
  { name: "romanian_deadlift", label: "Romanian deadlift" },
  { name: "leg_extension", label: "Leg extension" },
  { name: "leg_curl", label: "Lying leg curl" },
  { name: "seated_leg_curl", label: "Seated leg curl" },
  { name: "bulgarian_split_squat", label: "Bulgarian split squat" },
  { name: "walking_lunge", label: "Walking lunge" },
  { name: "hip_thrust", label: "Hip thrust" },
  { name: "glute_bridge", label: "Glute bridge" },
  { name: "calf_raises", label: "Standing calf raise" },
  { name: "seated_calf_raises", label: "Seated calf raise" },
];

const abs: CatalogExercise[] = [
  { name: "plank", label: "Plank", bodyweightBase: true, timed: true },
  { name: "side_plank", label: "Side plank", bodyweightBase: true, timed: true },
  { name: "hollow_hold", label: "Hollow body hold", bodyweightBase: true, timed: true },
  { name: "hanging_leg_raises", label: "Hanging leg raises", bodyweightBase: true },
  { name: "hanging_knee_raises", label: "Hanging knee raises", bodyweightBase: true },
  { name: "lying_leg_raises", label: "Lying leg raises", bodyweightBase: true },
  { name: "crunches", label: "Crunches", bodyweightBase: true },
  { name: "cable_crunch", label: "Cable crunch" },
  { name: "decline_sit_up", label: "Decline sit-up", bodyweightBase: true },
  { name: "ab_rollout", label: "Ab rollout", bodyweightBase: true },
  { name: "russian_twist", label: "Russian twist" },
  { name: "bicycle_crunch", label: "Bicycle crunch", bodyweightBase: true },
  { name: "dead_bug", label: "Dead bug", bodyweightBase: true },
  { name: "mountain_climbers", label: "Mountain climbers", bodyweightBase: true },
  { name: "v_up", label: "V-up", bodyweightBase: true },
  { name: "toes_to_bar", label: "Toes to bar", bodyweightBase: true },
];

export const EXERCISE_CATALOG: Record<string, CatalogExercise[]> = {
  chest,
  back,
  legs,
  abs,
};

export function catalogForType(workoutType: string): CatalogExercise[] {
  return EXERCISE_CATALOG[workoutType] ?? [];
}

export function filterCatalog(
  workoutType: string,
  query: string,
  limit = 8,
): CatalogExercise[] {
  const q = query.trim().toLowerCase();
  const all = catalogForType(workoutType);
  if (!q) return all.slice(0, limit);
  return all
    .filter(
      (e) =>
        e.name.includes(q) ||
        e.label.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function isTimedExerciseName(name: string): boolean {
  return /plank|hold/i.test(name);
}

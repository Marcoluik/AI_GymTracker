-- Warmup sets are stored alongside working sets, but excluded from normal
-- volume/progress/PR calculations in the app.
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise_warmup
  ON sets (workout_id, exercise_name, is_warmup DESC, set_number);

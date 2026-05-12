-- =====================================================
-- Migration 003: Sets + Reps tracking, plus Abs workout type
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- =====================================================

-- 1. Add per-set rep tracking ----------------------------------------
ALTER TABLE sets ADD COLUMN IF NOT EXISTS reps        INTEGER;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS set_number  INTEGER;

CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise
  ON sets (workout_id, exercise_name, set_number);

-- 2. Add default sets / reps to the program prescription ------------
ALTER TABLE program ADD COLUMN IF NOT EXISTS default_sets INTEGER;
ALTER TABLE program ADD COLUMN IF NOT EXISTS default_reps INTEGER;

-- 3. Sensible defaults for existing program rows ---------------------
UPDATE program SET default_sets = 3 WHERE default_sets IS NULL;
UPDATE program SET default_reps = 8 WHERE default_reps IS NULL;

-- 4. Seed the Abs program -------------------------------------------
-- reps on timed exercises (planks, holds) = seconds held
INSERT INTO program
  (workout_type, exercise_name, default_weight_kg, default_sets, default_reps, display_order, is_bodyweight_base)
VALUES
  ('abs', 'plank',               NULL, 3, 60, 1, TRUE),
  ('abs', 'hanging_leg_raises',  NULL, 3, 12, 2, TRUE),
  ('abs', 'cable_crunch',        25,   3, 15, 3, FALSE),
  ('abs', 'ab_rollout',          NULL, 3, 10, 4, TRUE),
  ('abs', 'russian_twist',       10,   3, 20, 5, FALSE),
  ('abs', 'dead_bug',            NULL, 3, 12, 6, TRUE),
  ('abs', 'hollow_hold',         NULL, 3, 30, 7, TRUE)
ON CONFLICT (workout_type, exercise_name) DO NOTHING;

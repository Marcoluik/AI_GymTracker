-- =====================================================
-- AI GymTracker — Initial Schema + Seed
-- Paste this entire file into Supabase → SQL Editor → Run
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT)
-- =====================================================

-- Tables -----------------------------------------------

CREATE TABLE IF NOT EXISTS program (
    id              SERIAL PRIMARY KEY,
    workout_type    TEXT  NOT NULL,
    exercise_name   TEXT  NOT NULL,
    default_weight_kg FLOAT,
    display_order   INT   NOT NULL DEFAULT 0,
    UNIQUE (workout_type, exercise_name)
);

CREATE TABLE IF NOT EXISTS workouts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date         DATE NOT NULL,
    workout_type TEXT NOT NULL,
    raw_message  TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id    UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    weight_kg     FLOAT,
    skipped       BOOLEAN NOT NULL DEFAULT FALSE,
    is_deviation  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id       UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    duration_minutes INT,
    distance_km      FLOAT,
    notes            TEXT
);

-- Indexes ----------------------------------------------

CREATE INDEX IF NOT EXISTS idx_workouts_date     ON workouts (date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_type     ON workouts (workout_type);
CREATE INDEX IF NOT EXISTS idx_sets_workout_id   ON sets     (workout_id);
CREATE INDEX IF NOT EXISTS idx_runs_workout_id   ON runs     (workout_id);
CREATE INDEX IF NOT EXISTS idx_program_type      ON program  (workout_type, display_order);

-- Seed: base program -----------------------------------
-- ON CONFLICT keeps existing rows untouched if you re-run.

INSERT INTO program (workout_type, exercise_name, default_weight_kg, display_order) VALUES
    ('chest', 'incline_chest_press', 28,  1),
    ('chest', 'flat_bench_press',    32,  2),
    ('chest', 'cable_flies',         35,  3),
    ('chest', 'shoulder_press',      24,  4),
    ('chest', 'lateral_raises',      14,  5),

    ('back',  'pull_ups',            NULL, 1),  -- bodyweight
    ('back',  'seated_cable_row',    60,   2),
    ('back',  'lat_pulldown',        65,   3),
    ('back',  'face_pulls',          20,   4),
    ('back',  'barbell_row',         70,   5),

    ('legs',  'squat',               80,   1),
    ('legs',  'leg_press',           140,  2),
    ('legs',  'romanian_deadlift',   70,   3),
    ('legs',  'leg_extension',       50,   4),
    ('legs',  'leg_curl',            45,   5),
    ('legs',  'calf_raises',         60,   6)
ON CONFLICT (workout_type, exercise_name) DO NOTHING;

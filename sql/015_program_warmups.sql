-- Program-level control for smart warmup generation.
-- When warmup_enabled is false, the logger will not add warmup sets for that
-- program exercise.

ALTER TABLE program
  ADD COLUMN IF NOT EXISTS warmup_enabled BOOLEAN NOT NULL DEFAULT TRUE;


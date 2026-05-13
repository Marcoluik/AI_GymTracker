-- Backfills exercise_id on program rows that should already be linked.
-- Matches by stripping hyphens/punctuation from library IDs (same rule the
-- frontend's normalize() function applies to exercise names).
UPDATE program AS p
SET exercise_id = el.id
FROM exercise_library AS el
WHERE p.exercise_id IS NULL
  AND p.exercise_name = regexp_replace(lower(el.id), '[^a-z0-9_]', '', 'g');

-- Show how many rows are still unlinked after the backfill
SELECT exercise_name, exercise_id
FROM program
WHERE exercise_id IS NULL
ORDER BY id DESC;

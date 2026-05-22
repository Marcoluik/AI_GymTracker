-- Strip the "_custom_<timestamp>" suffix from sets.exercise_name. That suffix
-- only appeared because of an old AddSheet bug that stored the library id as
-- the set's exercise_name. After this runs, "Machine Hip Thrust Custom
-- 1921923129" becomes plain "Machine Hip Thrust" everywhere it's displayed.
UPDATE sets
SET exercise_name = regexp_replace(exercise_name, '_custom_\d+$', '')
WHERE exercise_name ~ '_custom_\d+$';

-- Confirm: should return zero rows.
SELECT exercise_name, COUNT(*) AS still_bad
FROM sets
WHERE exercise_name ~ '_custom_\d+$'
GROUP BY exercise_name;

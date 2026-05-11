-- =====================================================
-- AI GymTracker — Migration 002: Row Level Security
-- Locks all tables so only marcokot@icloud.com (signed in
-- via Supabase magic-link auth) can read/write.
--
-- The log-workout edge function uses SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS, so the iOS Shortcut flow keeps working.
-- =====================================================

-- 1. Enable RLS on every table
ALTER TABLE program  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs     ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policies if re-running (safe to ignore "does not exist" errors)
DROP POLICY IF EXISTS "owner_all_program"  ON program;
DROP POLICY IF EXISTS "owner_all_workouts" ON workouts;
DROP POLICY IF EXISTS "owner_all_sets"     ON sets;
DROP POLICY IF EXISTS "owner_all_runs"     ON runs;

-- 3. Owner-only policies
CREATE POLICY "owner_all_program" ON program
    FOR ALL TO authenticated
    USING      ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

CREATE POLICY "owner_all_workouts" ON workouts
    FOR ALL TO authenticated
    USING      ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

CREATE POLICY "owner_all_sets" ON sets
    FOR ALL TO authenticated
    USING      ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

CREATE POLICY "owner_all_runs" ON runs
    FOR ALL TO authenticated
    USING      ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

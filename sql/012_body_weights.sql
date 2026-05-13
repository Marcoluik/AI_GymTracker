-- Bodyweight log: one row per day (overwrite if same date)
CREATE TABLE IF NOT EXISTS body_weights (
  date       date PRIMARY KEY,
  kg         float NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE body_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON body_weights
  FOR ALL
  USING  ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

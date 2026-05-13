-- Exercise images (populated by scripts/add-exercise-images.mjs)
ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS images text[];

-- Progress photos table
CREATE TABLE IF NOT EXISTS progress_photos (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  taken_at    date    NOT NULL DEFAULT CURRENT_DATE,
  storage_path text   NOT NULL,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON progress_photos
  FOR ALL
  USING  ((auth.jwt() ->> 'email') = 'marcokot@icloud.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'marcokot@icloud.com');

-- Storage bucket policies (bucket must be created manually in dashboard)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('progress-photos', 'progress-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "owner_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'progress-photos'
    AND (auth.jwt() ->> 'email') = 'marcokot@icloud.com');

CREATE POLICY "owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'progress-photos'
    AND (auth.jwt() ->> 'email') = 'marcokot@icloud.com');

CREATE POLICY "owner_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'progress-photos'
    AND (auth.jwt() ->> 'email') = 'marcokot@icloud.com');

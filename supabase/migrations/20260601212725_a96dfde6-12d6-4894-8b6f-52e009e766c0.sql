UPDATE storage.buckets
SET public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
WHERE id = 'part-photos';

DROP POLICY IF EXISTS "Part photos public read" ON storage.objects;
DROP POLICY IF EXISTS "Users list own part photos" ON storage.objects;

CREATE POLICY "Part photos public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'part-photos');
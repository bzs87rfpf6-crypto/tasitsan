DROP POLICY IF EXISTS "Part photos public read" ON storage.objects;
DROP POLICY IF EXISTS "Users list own part photos" ON storage.objects;

CREATE POLICY "Users list own part photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'part-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

REVOKE EXECUTE ON FUNCTION public.claim_part_image_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_part_image_jobs(int) TO service_role;

-- storage policies for part-images bucket
DROP POLICY IF EXISTS "part-images public read" ON storage.objects;
CREATE POLICY "part-images public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'part-images');

DROP POLICY IF EXISTS "part-images service write" ON storage.objects;
CREATE POLICY "part-images service write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'part-images')
  WITH CHECK (bucket_id = 'part-images');

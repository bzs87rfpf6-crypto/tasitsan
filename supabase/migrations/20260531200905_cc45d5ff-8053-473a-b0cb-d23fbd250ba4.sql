
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP POLICY "Part photos public read" ON storage.objects;
-- Public URLs still work for public buckets without an explicit SELECT policy.
-- Restrict any list/select via API to authenticated users browsing their own folder.
CREATE POLICY "Users list own part photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'part-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

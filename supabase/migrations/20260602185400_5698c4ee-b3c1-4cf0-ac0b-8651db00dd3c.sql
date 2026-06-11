
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Avatar storage policies (avatars bucket is private; objects served via signed URLs)
CREATE POLICY "Avatars readable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins delete any avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update any avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));


CREATE POLICY "stok-uploads owner all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'stok-uploads' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'::app_role)))
  WITH CHECK (bucket_id = 'stok-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

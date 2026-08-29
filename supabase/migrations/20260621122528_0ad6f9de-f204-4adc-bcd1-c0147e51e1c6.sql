
CREATE POLICY "oem_lib_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'oem-image-library');
CREATE POLICY "oem_lib_admin_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'oem-image-library' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "oem_lib_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'oem-image-library' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "oem_lib_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'oem-image-library' AND public.has_role(auth.uid(), 'admin'));


-- Storage policies for live-chat-attachments bucket
DROP POLICY IF EXISTS "live_chat_upload_anon" ON storage.objects;
CREATE POLICY "live_chat_upload_anon" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'live-chat-attachments');

DROP POLICY IF EXISTS "live_chat_upload_auth" ON storage.objects;
CREATE POLICY "live_chat_upload_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-chat-attachments');

DROP POLICY IF EXISTS "live_chat_read_all" ON storage.objects;
CREATE POLICY "live_chat_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'live-chat-attachments');

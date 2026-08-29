DO $$
DECLARE cid uuid;
BEGIN
  INSERT INTO public.live_chat_conversations (visitor_id, user_id, session_id, initiated_by, status, subject, user_meta, device_meta)
  VALUES ('f5cbf6b1f5f2f30f3f90a4fbf2126be9', NULL, 'mt0372cn1v56fnl1', 'admin', 'active', 'E2E test', '{}'::jsonb, '{}'::jsonb)
  RETURNING id INTO cid;
  INSERT INTO public.live_chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (cid, 'admin', NULL, 'Merhaba, size yardımcı olabiliriz 👋');
END $$;
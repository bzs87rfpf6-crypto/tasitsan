DO $$
DECLARE cid uuid;
BEGIN
  INSERT INTO public.live_chat_conversations (visitor_id, user_id, session_id, initiated_by, status, subject, user_meta, device_meta)
  VALUES ('sessmt03c9vz47hujbe7', NULL, 'mt03c9vz47hujbe7', 'admin', 'active', 'E2E test 2', '{}'::jsonb, '{}'::jsonb)
  RETURNING id INTO cid;
  INSERT INTO public.live_chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (cid, 'admin', NULL, 'Merhaba, size yardımcı olabiliriz 👋');
END $$;
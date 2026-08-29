
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.live_chat_status AS ENUM ('waiting','active','closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.live_chat_sender AS ENUM ('visitor','admin','system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =========================================================
-- Conversations
-- =========================================================
CREATE TABLE IF NOT EXISTS public.live_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.live_chat_status NOT NULL DEFAULT 'waiting',
  assigned_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  user_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  device_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  unread_admin INT NOT NULL DEFAULT 0,
  unread_visitor INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT live_chat_conv_owner_chk CHECK (visitor_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS live_chat_conv_status_idx ON public.live_chat_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS live_chat_conv_visitor_idx ON public.live_chat_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS live_chat_conv_user_idx ON public.live_chat_conversations(user_id);

GRANT SELECT, INSERT, UPDATE ON public.live_chat_conversations TO anon;
GRANT SELECT, INSERT, UPDATE ON public.live_chat_conversations TO authenticated;
GRANT ALL ON public.live_chat_conversations TO service_role;

ALTER TABLE public.live_chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv admin all" ON public.live_chat_conversations;
CREATE POLICY "conv admin all" ON public.live_chat_conversations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "conv owner select" ON public.live_chat_conversations;
CREATE POLICY "conv owner select" ON public.live_chat_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conv owner insert" ON public.live_chat_conversations;
CREATE POLICY "conv owner insert" ON public.live_chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conv owner update" ON public.live_chat_conversations;
CREATE POLICY "conv owner update" ON public.live_chat_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Guest access: conversation UUID acts as unguessable capability
DROP POLICY IF EXISTS "conv guest select" ON public.live_chat_conversations;
CREATE POLICY "conv guest select" ON public.live_chat_conversations
  FOR SELECT TO anon
  USING (visitor_id IS NOT NULL AND user_id IS NULL);

DROP POLICY IF EXISTS "conv guest insert" ON public.live_chat_conversations;
CREATE POLICY "conv guest insert" ON public.live_chat_conversations
  FOR INSERT TO anon
  WITH CHECK (visitor_id IS NOT NULL AND user_id IS NULL AND status = 'waiting');

DROP POLICY IF EXISTS "conv guest update" ON public.live_chat_conversations;
CREATE POLICY "conv guest update" ON public.live_chat_conversations
  FOR UPDATE TO anon
  USING (visitor_id IS NOT NULL AND user_id IS NULL)
  WITH CHECK (visitor_id IS NOT NULL AND user_id IS NULL);

-- =========================================================
-- Messages
-- =========================================================
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.live_chat_conversations(id) ON DELETE CASCADE,
  sender_type public.live_chat_sender NOT NULL,
  sender_id UUID,
  message TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT live_chat_msg_content_chk CHECK (
    (message IS NOT NULL AND length(btrim(message)) > 0) OR attachment_url IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS live_chat_msg_conv_idx ON public.live_chat_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.live_chat_messages TO anon;
GRANT SELECT, INSERT, UPDATE ON public.live_chat_messages TO authenticated;
GRANT ALL ON public.live_chat_messages TO service_role;

ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg admin all" ON public.live_chat_messages;
CREATE POLICY "msg admin all" ON public.live_chat_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "msg owner select" ON public.live_chat_messages;
CREATE POLICY "msg owner select" ON public.live_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "msg owner insert" ON public.live_chat_messages;
CREATE POLICY "msg owner insert" ON public.live_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'visitor'
    AND EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid() AND c.status <> 'closed')
  );

DROP POLICY IF EXISTS "msg owner update" ON public.live_chat_messages;
CREATE POLICY "msg owner update" ON public.live_chat_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "msg guest select" ON public.live_chat_messages;
CREATE POLICY "msg guest select" ON public.live_chat_messages
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id IS NULL));

DROP POLICY IF EXISTS "msg guest insert" ON public.live_chat_messages;
CREATE POLICY "msg guest insert" ON public.live_chat_messages
  FOR INSERT TO anon
  WITH CHECK (
    sender_type = 'visitor'
    AND EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id IS NULL AND c.status <> 'closed')
  );

DROP POLICY IF EXISTS "msg guest update" ON public.live_chat_messages;
CREATE POLICY "msg guest update" ON public.live_chat_messages
  FOR UPDATE TO anon
  USING (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_chat_conversations c WHERE c.id = conversation_id AND c.user_id IS NULL));

-- =========================================================
-- Notes (admin-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.live_chat_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.live_chat_conversations(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_chat_notes_conv_idx ON public.live_chat_notes(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_chat_notes TO authenticated;
GRANT ALL ON public.live_chat_notes TO service_role;

ALTER TABLE public.live_chat_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes admin all" ON public.live_chat_notes;
CREATE POLICY "notes admin all" ON public.live_chat_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND admin_id = auth.uid());

-- =========================================================
-- Triggers: keep updated_at & counters/preview fresh
-- =========================================================
CREATE OR REPLACE FUNCTION public.live_chat_conv_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS live_chat_conv_touch_trg ON public.live_chat_conversations;
CREATE TRIGGER live_chat_conv_touch_trg
  BEFORE UPDATE ON public.live_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.live_chat_conv_touch();

CREATE OR REPLACE FUNCTION public.live_chat_after_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  preview TEXT;
BEGIN
  preview := COALESCE(NULLIF(btrim(NEW.message),''), CASE WHEN NEW.attachment_url IS NOT NULL THEN '[dosya]' ELSE '' END);
  IF NEW.sender_type = 'visitor' THEN
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          unread_admin = unread_admin + 1,
          status = CASE WHEN status = 'closed' THEN 'active' ELSE status END,
          updated_at = now()
      WHERE id = NEW.conversation_id;
  ELSIF NEW.sender_type = 'admin' THEN
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          unread_visitor = unread_visitor + 1,
          status = CASE WHEN status IN ('waiting','closed') THEN 'active' ELSE status END,
          assigned_admin = COALESCE(assigned_admin, NEW.sender_id),
          updated_at = now()
      WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          updated_at = now()
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS live_chat_after_message_trg ON public.live_chat_messages;
CREATE TRIGGER live_chat_after_message_trg
  AFTER INSERT ON public.live_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.live_chat_after_message();

-- =========================================================
-- Realtime publication
-- =========================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_conversations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_notes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.live_chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.live_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.live_chat_notes REPLICA IDENTITY FULL;

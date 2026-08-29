ALTER TABLE public.live_chat_conversations
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'visitor';

CREATE INDEX IF NOT EXISTS live_chat_conversations_visitor_status_idx
  ON public.live_chat_conversations (visitor_id, status);
CREATE INDEX IF NOT EXISTS live_chat_conversations_session_idx
  ON public.live_chat_conversations (session_id);

CREATE TABLE IF NOT EXISTS public.live_chat_visitor_sessions (
  session_id text PRIMARY KEY,
  visitor_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_path text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.live_chat_visitor_sessions TO service_role;
ALTER TABLE public.live_chat_visitor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read visitor session map"
  ON public.live_chat_visitor_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS live_chat_visitor_sessions_visitor_idx
  ON public.live_chat_visitor_sessions (visitor_id);
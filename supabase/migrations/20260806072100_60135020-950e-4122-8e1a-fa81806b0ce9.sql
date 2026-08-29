ALTER TABLE public.support_chats
  ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_rating smallint,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;
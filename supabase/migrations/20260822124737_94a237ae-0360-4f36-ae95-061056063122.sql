CREATE TABLE IF NOT EXISTS public.partsfinder_collection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'default',
  query text,
  search_type text NOT NULL DEFAULT 'name',
  kind text NOT NULL DEFAULT 'search',
  status text NOT NULL DEFAULT 'waiting',
  page_url text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  saved_count integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partsfinder_collection_sessions TO authenticated;
GRANT ALL ON public.partsfinder_collection_sessions TO service_role;

ALTER TABLE public.partsfinder_collection_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pf_collect_admin_read" ON public.partsfinder_collection_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_pf_collect_user ON public.partsfinder_collection_sessions (user_id, created_at DESC);

CREATE TRIGGER trg_pf_collect_updated BEFORE UPDATE ON public.partsfinder_collection_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
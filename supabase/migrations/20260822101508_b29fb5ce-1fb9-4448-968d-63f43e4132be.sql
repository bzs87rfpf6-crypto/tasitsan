CREATE TABLE public.bilus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  username text NOT NULL,
  cookie text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bilus_sessions TO service_role;

ALTER TABLE public.bilus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bilus_sessions_service_only" ON public.bilus_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_bilus_sessions_updated_at
  BEFORE UPDATE ON public.bilus_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
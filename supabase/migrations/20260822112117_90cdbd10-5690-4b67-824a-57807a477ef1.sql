CREATE TABLE public.bilus_oem_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  verified_oem text,
  bilus_code text,
  raw_part_name text,
  normalized_part_name text,
  source_url text,
  source_urls text[] NOT NULL DEFAULT '{}',
  source_page integer,
  discovered_from_oem text,
  is_verified_oem boolean NOT NULL DEFAULT false,
  verification_source_url text,
  status text NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bilus_oem_discovery_brand_code_key
  ON public.bilus_oem_discovery (brand, COALESCE(verified_oem, bilus_code, ''));
CREATE INDEX bilus_oem_discovery_verified_idx ON public.bilus_oem_discovery (is_verified_oem, brand);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bilus_oem_discovery TO authenticated;
GRANT ALL ON public.bilus_oem_discovery TO service_role;
ALTER TABLE public.bilus_oem_discovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bilus oem discovery"
  ON public.bilus_oem_discovery FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.bilus_explorer_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL,
  start_oem text,
  list_url text,
  next_url text,
  last_page integer NOT NULL DEFAULT 0,
  max_records integer NOT NULL DEFAULT 50,
  scanned_pages integer NOT NULL DEFAULT 0,
  candidates_found integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  unverified_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  status text NOT NULL DEFAULT 'idle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bilus_explorer_jobs_user_brand_key ON public.bilus_explorer_jobs (user_id, brand);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bilus_explorer_jobs TO authenticated;
GRANT ALL ON public.bilus_explorer_jobs TO service_role;
ALTER TABLE public.bilus_explorer_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bilus explorer jobs"
  ON public.bilus_explorer_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_bilus_oem_discovery_updated_at
  BEFORE UPDATE ON public.bilus_oem_discovery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bilus_explorer_jobs_updated_at
  BEFORE UPDATE ON public.bilus_explorer_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
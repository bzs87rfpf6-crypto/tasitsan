CREATE TABLE IF NOT EXISTS public.bilus_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog text NOT NULL,
  catalog_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_page integer NOT NULL DEFAULT 0,
  next_url text,
  total_pages integer,
  records_found integer NOT NULL DEFAULT 0,
  unique_oems integer NOT NULL DEFAULT 0,
  duplicate_oems integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog)
);

GRANT SELECT ON public.bilus_scan_jobs TO authenticated;
GRANT ALL ON public.bilus_scan_jobs TO service_role;
ALTER TABLE public.bilus_scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bilus_jobs_admin_read" ON public.bilus_scan_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.bilus_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog text NOT NULL,
  oem text NOT NULL,
  normalized_oem text NOT NULL,
  part_name text NOT NULL,
  alternative_names text[] NOT NULL DEFAULT '{}',
  brand text,
  model text,
  vehicle text,
  source_url text,
  page integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog, normalized_oem)
);

CREATE INDEX IF NOT EXISTS bilus_items_catalog_idx ON public.bilus_catalog_items (catalog);
CREATE INDEX IF NOT EXISTS bilus_items_oem_idx ON public.bilus_catalog_items (normalized_oem);

GRANT SELECT ON public.bilus_catalog_items TO authenticated;
GRANT ALL ON public.bilus_catalog_items TO service_role;
ALTER TABLE public.bilus_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bilus_items_admin_read" ON public.bilus_catalog_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
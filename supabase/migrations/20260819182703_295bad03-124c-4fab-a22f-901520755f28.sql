CREATE TABLE IF NOT EXISTS public.smart_oem_research_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_query text NOT NULL,
  brand text,
  model text,
  part_category text,
  position text,
  oem_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS smart_oem_research_cache_key_idx
  ON public.smart_oem_research_cache (normalized_query);
CREATE INDEX IF NOT EXISTS smart_oem_research_cache_expires_idx
  ON public.smart_oem_research_cache (expires_at);
CREATE INDEX IF NOT EXISTS smart_oem_research_cache_brand_idx
  ON public.smart_oem_research_cache (brand, part_category, position);

GRANT ALL ON public.smart_oem_research_cache TO service_role;
GRANT SELECT ON public.smart_oem_research_cache TO authenticated;
ALTER TABLE public.smart_oem_research_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view smart oem research cache"
  ON public.smart_oem_research_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.oem_research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  brand text,
  model text,
  part_category text,
  position text,
  oem_code text NOT NULL,
  normalized_oem text NOT NULL,
  source_name text,
  source_url text,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oem_research_results_norm_idx ON public.oem_research_results (normalized_oem);
CREATE INDEX IF NOT EXISTS oem_research_results_query_idx ON public.oem_research_results (query);
CREATE INDEX IF NOT EXISTS oem_research_results_created_idx ON public.oem_research_results (created_at DESC);
CREATE INDEX IF NOT EXISTS oem_research_results_status_idx ON public.oem_research_results (verification_status);

GRANT ALL ON public.oem_research_results TO service_role;
GRANT SELECT ON public.oem_research_results TO authenticated;
ALTER TABLE public.oem_research_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view oem research results"
  ON public.oem_research_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
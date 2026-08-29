-- ai_content_cache: AI ile üretilen zenginleştirilmiş içerikleri saklar
CREATE TABLE public.ai_content_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,             -- 'part' | 'oem' | 'landing'
  scope_key text NOT NULL,          -- part uuid, oem kodu veya landing slug
  content jsonb NOT NULL,
  quality_score integer NOT NULL DEFAULT 0,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (scope, scope_key)
);

CREATE INDEX idx_ai_content_cache_scope ON public.ai_content_cache (scope, scope_key);
CREATE INDEX idx_ai_content_cache_generated ON public.ai_content_cache (generated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_content_cache TO authenticated;
GRANT ALL ON public.ai_content_cache TO service_role;

ALTER TABLE public.ai_content_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_content_cache: admins full access"
  ON public.ai_content_cache
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- landing_page_registry: kombinasyon landing sayfaları için kalite/indexleme kaydı
CREATE TABLE public.landing_page_registry (
  slug text PRIMARY KEY,           -- örn 'toyota/hilux/fren-sistemi'
  kind text NOT NULL,               -- 'brand' | 'brand_model' | 'brand_model_category' | 'oem' | 'category'
  brand text,
  model text,
  category text,
  oem text,
  listings_count integer NOT NULL DEFAULT 0,
  unique_oems integer NOT NULL DEFAULT 0,
  unique_vehicles integer NOT NULL DEFAULT 0,
  quality_score integer NOT NULL DEFAULT 0,
  indexable boolean NOT NULL DEFAULT false,
  last_scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_landing_registry_indexable ON public.landing_page_registry (indexable) WHERE indexable = true;
CREATE INDEX idx_landing_registry_kind ON public.landing_page_registry (kind);
CREATE INDEX idx_landing_registry_score ON public.landing_page_registry (quality_score DESC);
CREATE INDEX idx_landing_registry_brand ON public.landing_page_registry (brand) WHERE brand IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_registry TO authenticated;
GRANT ALL ON public.landing_page_registry TO service_role;

ALTER TABLE public.landing_page_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_page_registry: admins full access"
  ON public.landing_page_registry
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sitemap ve kalite RPC'leri (service_role tarafından güvenli çağrılır)
CREATE OR REPLACE FUNCTION public.get_indexable_landing_pages(_limit integer DEFAULT 5000)
RETURNS TABLE (slug text, kind text, quality_score integer, last_scored_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slug, kind, quality_score, last_scored_at
  FROM public.landing_page_registry
  WHERE indexable = true
  ORDER BY quality_score DESC, last_scored_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_indexable_landing_pages(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_seo_growth_snapshot()
RETURNS TABLE (
  kind text,
  total_pages bigint,
  indexable_pages bigint,
  avg_quality numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kind,
    COUNT(*)::bigint AS total_pages,
    COUNT(*) FILTER (WHERE indexable)::bigint AS indexable_pages,
    ROUND(AVG(quality_score)::numeric, 1) AS avg_quality
  FROM public.landing_page_registry
  GROUP BY kind
  ORDER BY total_pages DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_seo_growth_snapshot() TO authenticated, service_role;
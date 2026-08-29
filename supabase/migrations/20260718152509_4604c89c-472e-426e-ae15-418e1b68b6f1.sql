
-- 1) product_seo_meta -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_seo_meta (
  part_id UUID PRIMARY KEY REFERENCES public.parts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  title_variant INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  needs_rewrite BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_seo_meta_hash ON public.product_seo_meta(content_hash);
CREATE INDEX IF NOT EXISTS idx_product_seo_meta_needs_rewrite ON public.product_seo_meta(needs_rewrite) WHERE needs_rewrite = true;

GRANT SELECT ON public.product_seo_meta TO authenticated;
GRANT ALL ON public.product_seo_meta TO service_role;
ALTER TABLE public.product_seo_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_seo_meta admin read"
  ON public.product_seo_meta FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) page_seo_scores --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_seo_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type TEXT NOT NULL,        -- product | landing | category | oem
  page_key TEXT NOT NULL,         -- e.g. part_id or slug
  url TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  title_ok BOOLEAN NOT NULL DEFAULT false,
  desc_ok BOOLEAN NOT NULL DEFAULT false,
  body_words INTEGER NOT NULL DEFAULT 0,
  alt_coverage INTEGER NOT NULL DEFAULT 0,
  jsonld_ok BOOLEAN NOT NULL DEFAULT false,
  internal_links INTEGER NOT NULL DEFAULT 0,
  canonical_ok BOOLEAN NOT NULL DEFAULT false,
  duplicate_flag BOOLEAN NOT NULL DEFAULT false,
  notes JSONB,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(page_type, page_key)
);
CREATE INDEX IF NOT EXISTS idx_page_seo_scores_type ON public.page_seo_scores(page_type);
CREATE INDEX IF NOT EXISTS idx_page_seo_scores_score ON public.page_seo_scores(score);

GRANT SELECT ON public.page_seo_scores TO authenticated;
GRANT ALL ON public.page_seo_scores TO service_role;
ALTER TABLE public.page_seo_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "page_seo_scores admin read"
  ON public.page_seo_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) seo_category_landing ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seo_category_landing (
  category_slug TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  listings_count INTEGER NOT NULL DEFAULT 0,
  distinct_brands INTEGER NOT NULL DEFAULT 0,
  distinct_oems INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  indexable BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_category_landing_indexable ON public.seo_category_landing(indexable) WHERE indexable = true;

GRANT SELECT ON public.seo_category_landing TO anon, authenticated;
GRANT ALL ON public.seo_category_landing TO service_role;
ALTER TABLE public.seo_category_landing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_category_landing public read"
  ON public.seo_category_landing FOR SELECT TO anon, authenticated
  USING (true);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_product_seo_meta_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_product_seo_meta_touch ON public.product_seo_meta;
CREATE TRIGGER trg_product_seo_meta_touch BEFORE UPDATE ON public.product_seo_meta
FOR EACH ROW EXECUTE FUNCTION public.tg_product_seo_meta_touch();

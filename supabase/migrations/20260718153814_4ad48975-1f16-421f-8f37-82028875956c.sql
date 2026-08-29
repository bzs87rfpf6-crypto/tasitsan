
ALTER TABLE public.product_seo_meta
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alt_texts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_psm_score ON public.product_seo_meta (score);
CREATE INDEX IF NOT EXISTS idx_psm_content_hash ON public.product_seo_meta (content_hash);
CREATE INDEX IF NOT EXISTS idx_psm_enriched_at ON public.product_seo_meta (enriched_at);

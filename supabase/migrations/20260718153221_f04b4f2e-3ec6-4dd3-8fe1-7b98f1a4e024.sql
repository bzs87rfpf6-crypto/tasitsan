
ALTER TABLE public.product_seo_meta
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_faqs jsonb,
  ADD COLUMN IF NOT EXISTS last_backfill_run_id uuid;

CREATE INDEX IF NOT EXISTS product_seo_meta_content_hash_idx ON public.product_seo_meta (content_hash);
CREATE INDEX IF NOT EXISTS product_seo_meta_needs_rewrite_idx ON public.product_seo_meta (needs_rewrite) WHERE needs_rewrite = true;

CREATE TABLE IF NOT EXISTS public.seo_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_size int NOT NULL DEFAULT 25,
  candidates_total int NOT NULL DEFAULT 0,
  processed_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  rewritten_count int NOT NULL DEFAULT 0,
  faq_generated_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  duplicate_groups_before int,
  duplicate_groups_after int,
  avg_title_length_before numeric,
  avg_title_length_after numeric,
  avg_desc_length_before numeric,
  avg_desc_length_after numeric,
  last_error text,
  notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.seo_backfill_runs TO authenticated;
GRANT ALL ON public.seo_backfill_runs TO service_role;

ALTER TABLE public.seo_backfill_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage backfill runs" ON public.seo_backfill_runs;
CREATE POLICY "Admins can manage backfill runs"
  ON public.seo_backfill_runs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_seo_backfill_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_backfill_runs_updated_at ON public.seo_backfill_runs;
CREATE TRIGGER trg_seo_backfill_runs_updated_at
  BEFORE UPDATE ON public.seo_backfill_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_seo_backfill_runs_updated_at();

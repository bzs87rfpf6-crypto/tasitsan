
ALTER TABLE public.part_image_jobs
  ADD COLUMN IF NOT EXISTS confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS confidence_band text,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_part_image_jobs_confidence
  ON public.part_image_jobs (confidence DESC NULLS LAST);

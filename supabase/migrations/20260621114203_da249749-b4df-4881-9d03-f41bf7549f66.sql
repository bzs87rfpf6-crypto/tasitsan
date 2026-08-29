-- Disable background OEM image batch processing.
-- On-demand only: the "İnternetten Görsel Bul" button triggers searches per user request.
-- Cache (oem_research_cache) ensures each OEM is searched at most once.

-- 1) Unschedule the image-resolver worker cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'image-resolver-worker') THEN
    PERFORM cron.unschedule('image-resolver-worker');
  END IF;
END $$;

-- 2) Drop the auto-enqueue triggers on parts so new/updated parts no longer create jobs
DROP TRIGGER IF EXISTS parts_enqueue_image_job_ins ON public.parts;
DROP TRIGGER IF EXISTS parts_enqueue_image_job_upd ON public.parts;

-- 3) Mark all queued/processing jobs as cancelled (no background worker will run them)
UPDATE public.part_image_jobs
SET status = 'failed',
    last_error = 'cancelled: background batch disabled (on-demand only)',
    finished_at = COALESCE(finished_at, now())
WHERE status IN ('queued', 'processing');
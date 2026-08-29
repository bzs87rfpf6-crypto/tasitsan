
-- 1) part_image_jobs
CREATE TABLE IF NOT EXISTS public.part_image_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id      uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  oem_code     text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','failed','skipped')),
  priority     int  NOT NULL DEFAULT 100,
  attempts     int  NOT NULL DEFAULT 0,
  last_error   text,
  image_url    text,
  source       text,
  duration_ms  int,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id)
);

CREATE INDEX IF NOT EXISTS part_image_jobs_status_idx
  ON public.part_image_jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS part_image_jobs_oem_idx
  ON public.part_image_jobs (oem_code);

GRANT SELECT ON public.part_image_jobs TO authenticated;
GRANT ALL    ON public.part_image_jobs TO service_role;

ALTER TABLE public.part_image_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage image jobs"
  ON public.part_image_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER part_image_jobs_set_updated
  BEFORE UPDATE ON public.part_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) auto_import_images on xml_feeds
ALTER TABLE public.xml_feeds
  ADD COLUMN IF NOT EXISTS auto_import_images boolean NOT NULL DEFAULT true;

-- 3) Trigger: enqueue when a part has no photos but has an OEM
CREATE OR REPLACE FUNCTION public.enqueue_part_image_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_oem text;
BEGIN
  IF NEW.photos IS NOT NULL AND array_length(NEW.photos,1) > 0 THEN
    RETURN NEW;
  END IF;
  v_oem := COALESCE(
    NULLIF(trim(NEW.oem_code),''),
    (SELECT c FROM unnest(COALESCE(NEW.oem_codes,'{}'::text[])) c WHERE c IS NOT NULL AND trim(c) <> '' LIMIT 1)
  );
  IF v_oem IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.part_image_jobs (part_id, oem_code, priority)
  VALUES (NEW.id, upper(trim(v_oem)), 100)
  ON CONFLICT (part_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS parts_enqueue_image_job_ins ON public.parts;
CREATE TRIGGER parts_enqueue_image_job_ins
  AFTER INSERT ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_part_image_job();

DROP TRIGGER IF EXISTS parts_enqueue_image_job_upd ON public.parts;
CREATE TRIGGER parts_enqueue_image_job_upd
  AFTER UPDATE OF photos, oem_code, oem_codes ON public.parts
  FOR EACH ROW
  WHEN (
    (NEW.photos IS NULL OR array_length(NEW.photos,1) IS NULL OR array_length(NEW.photos,1) = 0)
    AND (NEW.oem_code IS NOT NULL OR array_length(NEW.oem_codes,1) > 0)
  )
  EXECUTE FUNCTION public.enqueue_part_image_job();

-- 4) Admin: enqueue all missing
CREATE OR REPLACE FUNCTION public.enqueue_missing_part_images(_limit int DEFAULT 2000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  WITH candidates AS (
    SELECT p.id AS part_id,
           upper(trim(COALESCE(
             NULLIF(p.oem_code,''),
             (SELECT c FROM unnest(p.oem_codes) c WHERE c IS NOT NULL AND trim(c) <> '' LIMIT 1)
           ))) AS oem
      FROM public.parts p
     WHERE (p.photos IS NULL OR array_length(p.photos,1) IS NULL OR array_length(p.photos,1) = 0)
       AND (p.oem_code IS NOT NULL OR array_length(p.oem_codes,1) > 0)
     LIMIT GREATEST(1, LEAST(_limit, 20000))
  )
  INSERT INTO public.part_image_jobs (part_id, oem_code, priority, status)
  SELECT c.part_id, c.oem, 100, 'pending'
    FROM candidates c
   WHERE c.oem IS NOT NULL AND c.oem <> ''
   ON CONFLICT (part_id) DO UPDATE
     SET status = CASE WHEN public.part_image_jobs.status = 'done' THEN 'done' ELSE 'pending' END,
         updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.admin_audit_log(actor_id, action, metadata)
  VALUES (auth.uid(), 'image_jobs_enqueue', jsonb_build_object('count', v_count));
  RETURN v_count;
END $$;

-- 5) Admin: retry failed
CREATE OR REPLACE FUNCTION public.retry_failed_part_images(_max_attempts int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.part_image_jobs
     SET status = 'pending', updated_at = now()
   WHERE status = 'failed' AND attempts < GREATEST(1, _max_attempts);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 6) Admin: progress
CREATE OR REPLACE FUNCTION public.part_image_jobs_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  WITH s AS (
    SELECT
      count(*) FILTER (WHERE status='pending')    AS pending,
      count(*) FILTER (WHERE status='processing') AS processing,
      count(*) FILTER (WHERE status='done')       AS done,
      count(*) FILTER (WHERE status='failed')     AS failed,
      count(*) FILTER (WHERE status='skipped')    AS skipped,
      count(*)                                    AS total,
      avg(duration_ms) FILTER (WHERE status='done' AND finished_at > now() - interval '1 hour') AS avg_ms,
      count(*) FILTER (WHERE status='done' AND finished_at > now() - interval '1 hour')         AS done_1h,
      count(*) FILTER (WHERE status='done' AND finished_at > now() - interval '24 hours')       AS done_24h,
      count(*) FILTER (WHERE status='failed' AND finished_at > now() - interval '24 hours')     AS failed_24h
    FROM public.part_image_jobs
  ),
  total_parts AS (
    SELECT count(*) AS total_products,
           count(*) FILTER (WHERE photos IS NULL OR array_length(photos,1) IS NULL OR array_length(photos,1) = 0)
             AS missing_photos
      FROM public.parts
  )
  SELECT jsonb_build_object(
    'pending',     s.pending,
    'processing',  s.processing,
    'done',        s.done,
    'failed',      s.failed,
    'skipped',     s.skipped,
    'total',       s.total,
    'avg_ms',      COALESCE(s.avg_ms, 0)::int,
    'done_1h',     s.done_1h,
    'done_24h',    s.done_24h,
    'failed_24h',  s.failed_24h,
    'success_rate', CASE WHEN (s.done + s.failed) > 0
                    THEN round(100.0 * s.done / (s.done + s.failed), 1)
                    ELSE 0 END,
    'eta_seconds', CASE WHEN s.done_1h > 0
                   THEN (s.pending * 3600.0 / s.done_1h)::int
                   ELSE NULL END,
    'total_products', total_parts.total_products,
    'missing_photos', total_parts.missing_photos
  ) INTO v FROM s, total_parts;
  RETURN v;
END $$;

-- 7) Worker: claim next batch (service_role only via security definer)
CREATE OR REPLACE FUNCTION public.claim_part_image_jobs(_batch int DEFAULT 10)
RETURNS SETOF public.part_image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.part_image_jobs
     WHERE status = 'pending'
     ORDER BY priority ASC, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(_batch, 25))
  )
  UPDATE public.part_image_jobs j
     SET status = 'processing',
         started_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
    FROM claimed
   WHERE j.id = claimed.id
   RETURNING j.*;
END $$;

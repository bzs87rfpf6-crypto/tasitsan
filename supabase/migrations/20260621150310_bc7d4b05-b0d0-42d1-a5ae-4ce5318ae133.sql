
-- 1) Kalite/log kolonları
ALTER TABLE public.oem_image_library
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS bytes integer,
  ADD COLUMN IF NOT EXISTS quality_score integer,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS source_query text;

-- 2) Başarısız aramalar tablosu (retry stratejisi için)
CREATE TABLE IF NOT EXISTS public.oem_failed_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem text NOT NULL,
  oem_normalized text GENERATED ALWAYS AS (normalize_oem(oem)) STORED,
  brand text,
  title text,
  reason text NOT NULL,
  tried_queries jsonb,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oem_failed_searches TO authenticated;
GRANT ALL ON public.oem_failed_searches TO service_role;
ALTER TABLE public.oem_failed_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_failed" ON public.oem_failed_searches FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS oem_failed_searches_norm_idx ON public.oem_failed_searches(oem_normalized);
CREATE INDEX IF NOT EXISTS oem_failed_searches_attempt_idx ON public.oem_failed_searches(last_attempt_at DESC);

-- 3) Toplu tarama kuyruğu
CREATE TABLE IF NOT EXISTS public.oem_scan_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.parts(id) ON DELETE CASCADE,
  oem text NOT NULL,
  brand text,
  title text,
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  result_count integer,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oem_scan_queue_status_check CHECK (status IN ('pending','processing','done','error','skipped'))
);

GRANT SELECT ON public.oem_scan_queue TO authenticated;
GRANT ALL ON public.oem_scan_queue TO service_role;
ALTER TABLE public.oem_scan_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_queue" ON public.oem_scan_queue FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS oem_scan_queue_status_idx ON public.oem_scan_queue(status, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS oem_scan_queue_pending_uniq ON public.oem_scan_queue(part_id) WHERE status IN ('pending','processing');

-- 4) Kuyruğa enqueue eden RPC (admin)
CREATE OR REPLACE FUNCTION public.enqueue_oem_scan(
  _scope text,
  _brand text DEFAULT NULL,
  _oem text DEFAULT NULL,
  _limit integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH candidates AS (
    SELECT p.id AS part_id, p.oem_code AS oem, p.brand, p.title
    FROM public.parts p
    WHERE p.oem_code IS NOT NULL AND length(trim(p.oem_code)) > 0
      AND (_scope <> 'no_images' OR p.photos IS NULL OR jsonb_array_length(COALESCE(p.photos, '[]'::jsonb)) = 0)
      AND (_scope <> 'brand' OR lower(p.brand) = lower(_brand))
      AND (_scope <> 'oem' OR normalize_oem(p.oem_code) = normalize_oem(_oem))
    LIMIT _limit
  ),
  ins AS (
    INSERT INTO public.oem_scan_queue (part_id, oem, brand, title, scope)
    SELECT c.part_id, c.oem, c.brand, c.title, _scope
    FROM candidates c
    ON CONFLICT (part_id) WHERE status IN ('pending','processing') DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_oem_scan(text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_oem_scan(text, text, text, integer) TO authenticated;

-- 5) Kuyruktan iş alan RPC
CREATE OR REPLACE FUNCTION public.claim_oem_scan_jobs(_limit integer DEFAULT 5)
RETURNS SETOF public.oem_scan_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  UPDATE public.oem_scan_queue q
  SET status = 'processing', started_at = now(), attempts = attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.oem_scan_queue
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_oem_scan_jobs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_oem_scan_jobs(integer) TO authenticated;

-- 6) İş tamamlama RPC
CREATE OR REPLACE FUNCTION public.complete_oem_scan_job(
  _id uuid,
  _status text,
  _result_count integer DEFAULT NULL,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.oem_scan_queue
  SET status = _status, completed_at = now(), result_count = _result_count, last_error = _error
  WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_oem_scan_job(uuid, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_oem_scan_job(uuid, text, integer, text) TO authenticated;

-- 7) Geniş istatistik RPC
CREATE OR REPLACE FUNCTION public.oem_scanner_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'parts_total', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL),
    'parts_with_photo', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL AND photos IS NOT NULL AND jsonb_array_length(COALESCE(photos,'[]'::jsonb)) > 0),
    'parts_without_photo', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL AND (photos IS NULL OR jsonb_array_length(COALESCE(photos,'[]'::jsonb)) = 0)),
    'library_total', (SELECT count(*) FROM public.oem_image_library),
    'library_verified', (SELECT count(*) FROM public.oem_image_library WHERE verified = true),
    'library_unique_oems', (SELECT count(DISTINCT oem_normalized) FROM public.oem_image_library),
    'today_found', (SELECT count(*) FROM public.oem_image_library WHERE created_at >= now() - interval '1 day'),
    'queue_pending', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'pending'),
    'queue_processing', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'processing'),
    'queue_done', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'done'),
    'queue_error', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'error'),
    'failed_searches', (SELECT count(*) FROM public.oem_failed_searches),
    'success_rate', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE result_count > 0) / count(*))::integer END
      FROM public.oem_scan_queue WHERE status = 'done'
    )
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.oem_scanner_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.oem_scanner_stats() TO authenticated;

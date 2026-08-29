-- Add debug columns to scan queue
ALTER TABLE public.oem_scan_queue
  ADD COLUMN IF NOT EXISTS debug_log jsonb,
  ADD COLUMN IF NOT EXISTS found_urls integer;

-- Replace complete_oem_scan_job with a 5-arg version that also stores debug
DROP FUNCTION IF EXISTS public.complete_oem_scan_job(uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.complete_oem_scan_job(
  _id uuid,
  _status text,
  _result_count integer DEFAULT NULL,
  _error text DEFAULT NULL,
  _debug jsonb DEFAULT NULL,
  _found_urls integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.oem_scan_queue
  SET status = _status,
      completed_at = now(),
      result_count = COALESCE(_result_count, result_count),
      last_error = _error,
      debug_log = COALESCE(_debug, debug_log),
      found_urls = COALESCE(_found_urls, found_urls)
  WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_oem_scan_job(uuid, text, integer, text, jsonb, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_oem_scan_job(uuid, text, integer, text, jsonb, integer) TO authenticated;

-- List recent scan jobs (admin)
CREATE OR REPLACE FUNCTION public.recent_oem_scan_jobs(_limit integer DEFAULT 25)
RETURNS TABLE(
  id uuid,
  oem text,
  brand text,
  title text,
  status text,
  result_count integer,
  found_urls integer,
  last_error text,
  debug_log jsonb,
  scheduled_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT q.id, q.oem, q.brand, q.title, q.status, q.result_count, q.found_urls,
         q.last_error, q.debug_log, q.scheduled_at, q.completed_at
  FROM public.oem_scan_queue q
  ORDER BY COALESCE(q.completed_at, q.scheduled_at) DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.recent_oem_scan_jobs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.recent_oem_scan_jobs(integer) TO authenticated;
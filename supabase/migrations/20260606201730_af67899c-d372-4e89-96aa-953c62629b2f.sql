
CREATE OR REPLACE FUNCTION public.request_center_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active            bigint;
  v_fulfilled         bigint;
  v_avg_first_quote   numeric;
  v_avg_fulfillment   numeric;
BEGIN
  SELECT count(*) INTO v_active
    FROM public.part_requests
   WHERE status IN ('new','in_progress');

  SELECT count(*) INTO v_fulfilled
    FROM public.part_requests
   WHERE status = 'resolved';

  WITH first_q AS (
    SELECT pr.id,
           pr.created_at AS req_at,
           (SELECT min(q.created_at) FROM public.request_quotes q WHERE q.request_id = pr.id) AS first_quote_at,
           pr.updated_at AS resolved_at,
           pr.status
      FROM public.part_requests pr
     WHERE pr.created_at >= now() - interval '90 days'
  )
  SELECT
    avg(EXTRACT(EPOCH FROM (first_quote_at - req_at))/60.0)::numeric(12,1),
    avg(EXTRACT(EPOCH FROM (resolved_at - req_at))/3600.0)
      FILTER (WHERE status = 'resolved')::numeric(12,1)
    INTO v_avg_first_quote, v_avg_fulfillment
    FROM first_q
   WHERE first_quote_at IS NOT NULL;

  RETURN jsonb_build_object(
    'active',                    v_active,
    'fulfilled',                 v_fulfilled,
    'avg_first_quote_minutes',   COALESCE(v_avg_first_quote, 0),
    'avg_fulfillment_hours',     COALESCE(v_avg_fulfillment, 0)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.request_center_stats() TO anon, authenticated;

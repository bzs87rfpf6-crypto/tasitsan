CREATE OR REPLACE FUNCTION public.signup_funnel_stats(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from timestamptz := now() - make_interval(days => GREATEST(1, LEAST(_days, 90)));
  _view bigint; _start bigint; _submit bigint; _success bigint; _error bigint;
  _new_users bigint;
  _errors jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT
    count(*) FILTER (WHERE event_type = 'signup_view'),
    count(*) FILTER (WHERE event_type = 'signup_start'),
    count(*) FILTER (WHERE event_type = 'signup_submit'),
    count(*) FILTER (WHERE event_type = 'signup_success'),
    count(*) FILTER (WHERE event_type = 'signup_error')
  INTO _view, _start, _submit, _success, _error
  FROM public.analytics_events
  WHERE created_at >= _from
    AND COALESCE(is_bot, false) = false
    AND COALESCE(is_internal, false) = false
    AND event_type IN ('signup_view','signup_start','signup_submit','signup_success','signup_error');

  SELECT count(*) INTO _new_users FROM public.profiles WHERE created_at >= _from;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _errors FROM (
    SELECT COALESCE(metadata->>'error_code', 'unknown') AS error_code, count(*) AS count
    FROM public.analytics_events
    WHERE created_at >= _from AND event_type = 'signup_error'
      AND COALESCE(is_bot, false) = false AND COALESCE(is_internal, false) = false
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8
  ) x;

  RETURN jsonb_build_object(
    'days', GREATEST(1, LEAST(_days, 90)),
    'view', COALESCE(_view,0),
    'start', COALESCE(_start,0),
    'submit', COALESCE(_submit,0),
    'success', COALESCE(_success,0),
    'error', COALESCE(_error,0),
    'new_users', COALESCE(_new_users,0),
    'conversion_rate', CASE WHEN COALESCE(_view,0) > 0
      THEN round((COALESCE(_success,0)::numeric / _view) * 100, 2) ELSE 0 END,
    'submit_success_rate', CASE WHEN COALESCE(_submit,0) > 0
      THEN round((COALESCE(_success,0)::numeric / _submit) * 100, 2) ELSE 0 END,
    'top_errors', _errors
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.signup_funnel_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signup_funnel_stats(integer) TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.oem_research_cache
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cache_type text;

UPDATE public.oem_research_cache
SET cache_type = regexp_replace(cache_key, '^([^:]+:[^:]+):.*$', '\1')
WHERE cache_type IS NULL;

UPDATE public.oem_research_cache
SET expires_at = updated_at + interval '14 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS oem_research_cache_expires_idx ON public.oem_research_cache (expires_at);
CREATE INDEX IF NOT EXISTS oem_research_cache_type_idx ON public.oem_research_cache (cache_type);

CREATE OR REPLACE FUNCTION public.get_oem_research(_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_result jsonb;
BEGIN
  IF _key IS NULL OR length(_key) < 2 THEN RETURN NULL; END IF;
  UPDATE public.oem_research_cache
     SET hit_count = hit_count + 1, last_hit_at = now()
   WHERE cache_key = _key
     AND (expires_at IS NULL OR expires_at > now())
   RETURNING result INTO v_result;
  RETURN v_result;
END $$;

DROP FUNCTION IF EXISTS public.save_oem_research(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.save_oem_research(
  _key text, _query text, _result jsonb, _ttl_seconds integer DEFAULT 1209600
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_type text; v_ttl integer;
BEGIN
  IF _key IS NULL OR length(_key) < 2 THEN RETURN; END IF;
  v_ttl := GREATEST(3600, LEAST(COALESCE(_ttl_seconds, 1209600), 7776000));
  v_type := regexp_replace(_key, '^([^:]+:[^:]+):.*$', '\1');
  INSERT INTO public.oem_research_cache
    (cache_key, query_text, result, cache_type, expires_at)
  VALUES (_key, _query, _result, v_type, now() + make_interval(secs => v_ttl))
  ON CONFLICT (cache_key) DO UPDATE
    SET result = excluded.result,
        query_text = excluded.query_text,
        cache_type = excluded.cache_type,
        expires_at = excluded.expires_at,
        updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.invalidate_oem_research(_prefix text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _prefix IS NULL OR length(_prefix) < 3 THEN
    RAISE EXCEPTION 'prefix too short';
  END IF;
  UPDATE public.oem_research_cache
     SET expires_at = now() - interval '1 second'
   WHERE cache_key LIKE _prefix || '%'
     AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.admin_audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'oem_cache_invalidate',
          jsonb_build_object('prefix', _prefix, 'invalidated', v_count));
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.purge_expired_oem_research()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.oem_research_cache
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.save_oem_research(text, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_oem_research(text, text, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_oem_research(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_oem_research(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invalidate_oem_research(text) TO authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_oem_research() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_oem_research() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-oem-research-cache') THEN
    PERFORM cron.unschedule('purge-oem-research-cache');
  END IF;
  PERFORM cron.schedule(
    'purge-oem-research-cache',
    '0 3 * * 0',
    $cron$SELECT public.purge_expired_oem_research();$cron$
  );
END $$;

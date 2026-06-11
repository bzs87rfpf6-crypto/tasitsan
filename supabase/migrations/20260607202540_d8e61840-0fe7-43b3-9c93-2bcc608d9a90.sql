
CREATE TABLE IF NOT EXISTS public.oem_research_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query_text text NOT NULL,
  result jsonb NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oem_research_cache_key_idx ON public.oem_research_cache (cache_key);

GRANT SELECT ON public.oem_research_cache TO anon, authenticated;
GRANT ALL ON public.oem_research_cache TO service_role;

ALTER TABLE public.oem_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research cache readable by everyone"
  ON public.oem_research_cache
  FOR SELECT
  USING (true);

-- Read + bump hit counter atomically
CREATE OR REPLACE FUNCTION public.get_oem_research(_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF _key IS NULL OR length(_key) < 2 THEN RETURN NULL; END IF;
  UPDATE public.oem_research_cache
     SET hit_count = hit_count + 1,
         last_hit_at = now()
   WHERE cache_key = _key
   RETURNING result INTO v_result;
  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_oem_research(text) TO anon, authenticated;

-- Save / upsert (server only)
CREATE OR REPLACE FUNCTION public.save_oem_research(_key text, _query text, _result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _key IS NULL OR length(_key) < 2 THEN RETURN; END IF;
  INSERT INTO public.oem_research_cache (cache_key, query_text, result)
  VALUES (_key, _query, _result)
  ON CONFLICT (cache_key) DO UPDATE
    SET result = excluded.result,
        query_text = excluded.query_text,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_oem_research(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_oem_research(text, text, jsonb) TO service_role;

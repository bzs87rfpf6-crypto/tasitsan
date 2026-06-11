
CREATE OR REPLACE FUNCTION public.normalize_oem(code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT UPPER(REGEXP_REPLACE(COALESCE(code, ''), '[\s\-_./]', '', 'g'))
$$;

CREATE INDEX IF NOT EXISTS parts_oem_code_normalized_idx
  ON public.parts (public.normalize_oem(oem_code));

CREATE OR REPLACE FUNCTION public.search_parts_by_oem(_oem text)
RETURNS SETOF public.parts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH n AS (SELECT public.normalize_oem(_oem) AS oem)
  SELECT p.*
  FROM public.parts p, n
  WHERE p.status = 'approved'
    AND (
      public.normalize_oem(p.oem_code) = n.oem
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.oem_codes, ARRAY[]::text[])) AS c
        WHERE public.normalize_oem(c) = n.oem
      )
    )
  LIMIT 30
$$;

GRANT EXECUTE ON FUNCTION public.search_parts_by_oem(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_oem(text) TO anon, authenticated;

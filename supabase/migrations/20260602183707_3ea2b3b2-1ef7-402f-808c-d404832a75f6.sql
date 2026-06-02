
-- Phase 1: Multiple OEM codes, engine code, equivalent-parts RPC

-- 1) Add new columns
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS oem_codes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS engine_code TEXT;

-- 2) Backfill existing single oem_code into the array
UPDATE public.parts
SET oem_codes = ARRAY[upper(trim(oem_code))]
WHERE oem_code IS NOT NULL
  AND trim(oem_code) <> ''
  AND (oem_codes IS NULL OR array_length(oem_codes, 1) IS NULL);

-- 3) Trigger: normalize oem_codes (uppercase, trim, dedup) and keep oem_code in sync (primary = first item)
CREATE OR REPLACE FUNCTION public.parts_normalize_oem()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cleaned TEXT[];
BEGIN
  IF NEW.oem_codes IS NULL THEN
    NEW.oem_codes := '{}';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT upper(trim(c)) ORDER BY upper(trim(c))), '{}')
    INTO cleaned
  FROM unnest(NEW.oem_codes) AS c
  WHERE c IS NOT NULL AND trim(c) <> '';

  NEW.oem_codes := cleaned;

  -- Keep legacy single oem_code as the primary (first) value for ILIKE search & display fallback
  IF array_length(cleaned, 1) IS NULL THEN
    -- if no array provided but legacy oem_code present, promote it
    IF NEW.oem_code IS NOT NULL AND trim(NEW.oem_code) <> '' THEN
      NEW.oem_codes := ARRAY[upper(trim(NEW.oem_code))];
      NEW.oem_code := upper(trim(NEW.oem_code));
    ELSE
      NEW.oem_code := NULL;
    END IF;
  ELSE
    NEW.oem_code := cleaned[1];
  END IF;

  IF NEW.engine_code IS NOT NULL THEN
    NEW.engine_code := upper(trim(NEW.engine_code));
    IF NEW.engine_code = '' THEN NEW.engine_code := NULL; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_normalize_oem ON public.parts;
CREATE TRIGGER trg_parts_normalize_oem
  BEFORE INSERT OR UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.parts_normalize_oem();

-- 4) Indexes for fast OEM/engine lookup
CREATE INDEX IF NOT EXISTS idx_parts_oem_codes_gin ON public.parts USING GIN (oem_codes);
CREATE INDEX IF NOT EXISTS idx_parts_engine_code  ON public.parts (engine_code);

-- 5) Re-run trigger logic on existing rows so normalization applies
UPDATE public.parts SET oem_codes = oem_codes WHERE TRUE;

-- 6) RPC: find equivalent parts that share at least one OEM code (approved only)
CREATE OR REPLACE FUNCTION public.find_equivalent_parts(_part_id uuid, _limit int DEFAULT 12)
RETURNS TABLE (
  id uuid, title text, brand text, model text, year int,
  price numeric, city text, photos text[], condition text,
  stock_quantity int, oem_code text, oem_codes text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT oem_codes FROM public.parts WHERE id = _part_id
  )
  SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city,
         p.photos, p.condition, p.stock_quantity, p.oem_code, p.oem_codes
  FROM public.parts p, src
  WHERE p.id <> _part_id
    AND p.status = 'approved'
    AND array_length(src.oem_codes, 1) IS NOT NULL
    AND p.oem_codes && src.oem_codes
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.find_equivalent_parts(uuid, int) TO anon, authenticated, service_role;

-- 7) RPC: search by OEM (exact array match first, then ILIKE partial) — used by Phase 2
CREATE OR REPLACE FUNCTION public.search_parts_by_oem(_oem text, _limit int DEFAULT 40)
RETURNS TABLE (
  id uuid, title text, brand text, model text, year int,
  price numeric, city text, photos text[], condition text,
  stock_quantity int, oem_code text, oem_codes text[], match_kind text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT upper(trim(_oem)) AS o)
  SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city,
         p.photos, p.condition, p.stock_quantity, p.oem_code, p.oem_codes,
         CASE WHEN q.o = ANY(p.oem_codes) THEN 'exact' ELSE 'partial' END AS match_kind
  FROM public.parts p, q
  WHERE p.status = 'approved'
    AND q.o <> ''
    AND (
      q.o = ANY(p.oem_codes)
      OR EXISTS (
        SELECT 1 FROM unnest(p.oem_codes) c WHERE c ILIKE '%' || q.o || '%'
      )
    )
  ORDER BY (CASE WHEN q.o = ANY(p.oem_codes) THEN 0 ELSE 1 END), p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.search_parts_by_oem(text, int) TO anon, authenticated, service_role;

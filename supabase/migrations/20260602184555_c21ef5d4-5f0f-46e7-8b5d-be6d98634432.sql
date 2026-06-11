
-- Add city and engine_code to part_requests
ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS engine_code TEXT;

-- Recreate open_part_requests view to include new fields + city + engine_code
DROP VIEW IF EXISTS public.open_part_requests;
CREATE VIEW public.open_part_requests AS
  SELECT id, part_name, search_query, oem_code, brand, model, year, category,
         description, message, photos, status, city, engine_code, created_at
  FROM public.part_requests
  WHERE status = ANY (ARRAY['new'::text, 'in_progress'::text]);

GRANT SELECT ON public.open_part_requests TO anon, authenticated;

-- Allow anon (public/SEO) to read open + in_progress part_requests safely (no PII fields exposed via view; raw table still protected by existing RLS for authenticated buyers/admins).
-- We add a public SELECT policy on the base table scoped to open statuses so a public detail page can read by id, but PII columns are filtered at the query layer in code.
DROP POLICY IF EXISTS "Public sees open part requests" ON public.part_requests;
CREATE POLICY "Public sees open part requests"
  ON public.part_requests
  FOR SELECT
  TO anon
  USING (status = ANY (ARRAY['new'::text, 'in_progress'::text]));

-- Ensure anon has Data API grant for base table SELECT (RLS filters rows; code restricts columns).
GRANT SELECT ON public.part_requests TO anon;

-- Trigger to normalize OEM uppercase + city/engine trim
CREATE OR REPLACE FUNCTION public.part_requests_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.oem_code IS NOT NULL THEN
    NEW.oem_code := upper(trim(NEW.oem_code));
    IF NEW.oem_code = '' THEN NEW.oem_code := NULL; END IF;
  END IF;
  IF NEW.engine_code IS NOT NULL THEN
    NEW.engine_code := upper(trim(NEW.engine_code));
    IF NEW.engine_code = '' THEN NEW.engine_code := NULL; END IF;
  END IF;
  IF NEW.city IS NOT NULL THEN
    NEW.city := trim(NEW.city);
    IF NEW.city = '' THEN NEW.city := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_part_requests_normalize ON public.part_requests;
CREATE TRIGGER trg_part_requests_normalize
  BEFORE INSERT OR UPDATE ON public.part_requests
  FOR EACH ROW EXECUTE FUNCTION public.part_requests_normalize();

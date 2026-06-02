-- Dedicated OEM search log for analytics + history beyond the 30-day analytics window
CREATE TABLE public.oem_searches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oem text NOT NULL,
  user_id uuid,
  results_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_oem_searches_oem ON public.oem_searches (oem);
CREATE INDEX idx_oem_searches_created_at ON public.oem_searches (created_at DESC);

GRANT SELECT, INSERT ON public.oem_searches TO anon;
GRANT SELECT, INSERT ON public.oem_searches TO authenticated;
GRANT ALL ON public.oem_searches TO service_role;

ALTER TABLE public.oem_searches ENABLE ROW LEVEL SECURITY;

-- Anyone can log their OEM search (oem must be non-empty, length sane)
CREATE POLICY "Anyone can insert oem search"
ON public.oem_searches
FOR INSERT
TO anon, authenticated
WITH CHECK (length(oem) BETWEEN 2 AND 64);

-- Only admins can read raw rows
CREATE POLICY "Admins read oem searches"
ON public.oem_searches
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Normalize OEM to uppercase / trim
CREATE OR REPLACE FUNCTION public.oem_searches_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.oem := upper(trim(NEW.oem));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_oem_searches_normalize
BEFORE INSERT ON public.oem_searches
FOR EACH ROW EXECUTE FUNCTION public.oem_searches_normalize();

-- Aggregated top OEM searches (admin-only via SECURITY DEFINER + has_role check)
CREATE OR REPLACE FUNCTION public.top_oem_searches(_range text DEFAULT '30d', _limit integer DEFAULT 20)
RETURNS TABLE(oem text, search_count bigint, last_searched_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT s.oem, count(*)::bigint AS search_count, max(s.created_at) AS last_searched_at
  FROM public.oem_searches s
  WHERE (_range = 'all') OR (s.created_at >= now() - interval '30 days')
  GROUP BY s.oem
  ORDER BY search_count DESC, last_searched_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;

CREATE TABLE public.search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text,
  brand text,
  model text,
  city text,
  category text,
  oem text,
  part_type text,
  results_count integer NOT NULL DEFAULT 0,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_logs_created_at ON public.search_logs (created_at DESC);
CREATE INDEX idx_search_logs_query ON public.search_logs (lower(query));
CREATE INDEX idx_search_logs_brand_model ON public.search_logs (lower(brand), lower(model));
CREATE INDEX idx_search_logs_city ON public.search_logs (lower(city));

GRANT INSERT ON public.search_logs TO anon, authenticated;
GRANT SELECT ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert search log"
  ON public.search_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (query IS NULL OR length(query) <= 200) AND
    (brand IS NULL OR length(brand) <= 80) AND
    (model IS NULL OR length(model) <= 80) AND
    (city  IS NULL OR length(city)  <= 80) AND
    (oem   IS NULL OR length(oem)   <= 80)
  );

CREATE POLICY "Admins read search logs"
  ON public.search_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Normalize on insert
CREATE OR REPLACE FUNCTION public.search_logs_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.query IS NOT NULL THEN NEW.query := nullif(trim(NEW.query),''); END IF;
  IF NEW.brand IS NOT NULL THEN NEW.brand := nullif(trim(NEW.brand),''); END IF;
  IF NEW.model IS NOT NULL THEN NEW.model := nullif(trim(NEW.model),''); END IF;
  IF NEW.city  IS NOT NULL THEN NEW.city  := nullif(trim(NEW.city),'');  END IF;
  IF NEW.category IS NOT NULL THEN NEW.category := nullif(trim(NEW.category),''); END IF;
  IF NEW.part_type IS NOT NULL THEN NEW.part_type := nullif(trim(NEW.part_type),''); END IF;
  IF NEW.oem IS NOT NULL THEN NEW.oem := nullif(upper(trim(NEW.oem)),''); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_search_logs_normalize
  BEFORE INSERT ON public.search_logs
  FOR EACH ROW EXECUTE FUNCTION public.search_logs_normalize();

-- Top queries
CREATE OR REPLACE FUNCTION public.top_search_queries(_range text DEFAULT '30d', _limit integer DEFAULT 25)
RETURNS TABLE(query text, search_count bigint, last_searched_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz END;
  RETURN QUERY
  SELECT lower(s.query) AS query, count(*)::bigint, max(s.created_at)
  FROM public.search_logs s
  WHERE s.query IS NOT NULL AND s.created_at >= v_from
  GROUP BY lower(s.query)
  ORDER BY 2 DESC, 3 DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

-- Top brand/model
CREATE OR REPLACE FUNCTION public.top_search_brand_model(_range text DEFAULT '30d', _limit integer DEFAULT 25)
RETURNS TABLE(brand text, model text, search_count bigint, last_searched_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz END;
  RETURN QUERY
  SELECT initcap(lower(coalesce(s.brand,''))),
         initcap(lower(coalesce(s.model,''))),
         count(*)::bigint,
         max(s.created_at)
  FROM public.search_logs s
  WHERE (s.brand IS NOT NULL OR s.model IS NOT NULL) AND s.created_at >= v_from
  GROUP BY 1,2
  ORDER BY 3 DESC, 4 DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

-- Top cities
CREATE OR REPLACE FUNCTION public.top_search_cities(_range text DEFAULT '30d', _limit integer DEFAULT 25)
RETURNS TABLE(city text, search_count bigint, last_searched_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz END;
  RETURN QUERY
  SELECT initcap(lower(s.city)),
         count(*)::bigint,
         max(s.created_at)
  FROM public.search_logs s
  WHERE s.city IS NOT NULL AND s.created_at >= v_from
  GROUP BY 1
  ORDER BY 2 DESC, 3 DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

-- Allow top_oem_searches to filter range correctly (existing has bug where 'all' falls through but cap at 30d).
-- Recreate with proper range handling and bump max limit to 200.
CREATE OR REPLACE FUNCTION public.top_oem_searches(_range text DEFAULT '30d', _limit integer DEFAULT 25)
RETURNS TABLE(oem text, search_count bigint, last_searched_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz END;
  RETURN QUERY
  SELECT s.oem, count(*)::bigint, max(s.created_at)
  FROM public.oem_searches s
  WHERE s.created_at >= v_from
  GROUP BY s.oem
  ORDER BY 2 DESC, 3 DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

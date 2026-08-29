
-- 1) OEM Reference Knowledge Base
CREATE TABLE public.oem_reference (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oem TEXT NOT NULL,                          -- normalized: UPPER, no separators
  oem_raw TEXT,                               -- as originally entered
  alternative_oems TEXT[] NOT NULL DEFAULT '{}',   -- OEM eşdeğerleri (aynı üretici / farklı numara)
  cross_reference  TEXT[] NOT NULL DEFAULT '{}',   -- Yan sanayi cross-ref (Bosch, Denso, Valeo…)
  compatible_oems  TEXT[] NOT NULL DEFAULT '{}',   -- Uyumlu OEM (farklı araç/model)
  brand TEXT,
  model TEXT,
  year_from INT,
  year_to INT,
  engine_code TEXT,
  fuel TEXT,
  transmission TEXT,
  category TEXT,
  part_name TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'admin',       -- admin | ai_learned | imported
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes: fast OEM lookup + array containment + fuzzy part name
CREATE INDEX oem_reference_oem_idx           ON public.oem_reference (oem);
CREATE INDEX oem_reference_alt_oems_gin      ON public.oem_reference USING GIN (alternative_oems);
CREATE INDEX oem_reference_cross_ref_gin     ON public.oem_reference USING GIN (cross_reference);
CREATE INDEX oem_reference_compatible_gin    ON public.oem_reference USING GIN (compatible_oems);
CREATE INDEX oem_reference_brand_model_idx   ON public.oem_reference (brand, model);
CREATE INDEX oem_reference_category_idx      ON public.oem_reference (category);
CREATE INDEX oem_reference_verified_idx      ON public.oem_reference (verified) WHERE verified = true;

-- 2) GRANTS
GRANT SELECT ON public.oem_reference TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_reference TO authenticated;
GRANT ALL ON public.oem_reference TO service_role;

-- 3) RLS
ALTER TABLE public.oem_reference ENABLE ROW LEVEL SECURITY;

-- Public + auth can read ONLY verified rows (protects unvetted AI-learned data)
CREATE POLICY "oem_reference_public_read_verified"
  ON public.oem_reference FOR SELECT
  USING (verified = true);

-- Admins can read everything (including unverified)
CREATE POLICY "oem_reference_admin_read_all"
  ON public.oem_reference FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Admins can write
CREATE POLICY "oem_reference_admin_insert"
  ON public.oem_reference FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "oem_reference_admin_update"
  ON public.oem_reference FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "oem_reference_admin_delete"
  ON public.oem_reference FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 4) updated_at trigger (reuse existing helper if present, else create local one)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $fn$ LANGUAGE plpgsql SET search_path = public;
  END IF;
END $$;

CREATE TRIGGER trg_oem_reference_updated_at
  BEFORE UPDATE ON public.oem_reference
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Normalize helper (called by RPC + trigger)
CREATE OR REPLACE FUNCTION public.normalize_oem_code(_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT UPPER(regexp_replace(COALESCE(_raw,''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Auto-normalize oem on insert/update
CREATE OR REPLACE FUNCTION public.oem_reference_normalize()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.oem_raw IS NULL THEN NEW.oem_raw := NEW.oem; END IF;
  NEW.oem := public.normalize_oem_code(NEW.oem);
  NEW.alternative_oems := ARRAY(SELECT public.normalize_oem_code(x) FROM unnest(NEW.alternative_oems) x WHERE length(x) > 0);
  NEW.cross_reference  := ARRAY(SELECT public.normalize_oem_code(x) FROM unnest(NEW.cross_reference)  x WHERE length(x) > 0);
  NEW.compatible_oems  := ARRAY(SELECT public.normalize_oem_code(x) FROM unnest(NEW.compatible_oems)  x WHERE length(x) > 0);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_oem_reference_normalize
  BEFORE INSERT OR UPDATE ON public.oem_reference
  FOR EACH ROW EXECUTE FUNCTION public.oem_reference_normalize();

-- 6) Lookup RPC: given any OEM (in any format), return matching reference rows
CREATE OR REPLACE FUNCTION public.lookup_oem_reference(_oem TEXT, _limit INT DEFAULT 20)
RETURNS SETOF public.oem_reference
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT public.normalize_oem_code(_oem) AS n)
  SELECT r.* FROM public.oem_reference r, q
  WHERE r.verified = true
    AND (
      r.oem = q.n
      OR q.n = ANY(r.alternative_oems)
      OR q.n = ANY(r.cross_reference)
      OR q.n = ANY(r.compatible_oems)
    )
  ORDER BY (r.oem = q.n) DESC, r.confidence DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_oem_reference(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_oem_code(TEXT) TO anon, authenticated;

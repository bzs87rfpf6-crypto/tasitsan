-- OEM family normalize: collapse revision suffixes so 1320A015, 1320A015-A, 1320A015A all match.
CREATE OR REPLACE FUNCTION public.normalize_oem_family(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    regexp_replace(
      regexp_replace(
        UPPER(regexp_replace(COALESCE(_raw, ''), '[^A-Za-z0-9]', '', 'g')),
        '(REV|V)[0-9]+$', '', 'g'
      ),
      '([0-9])[A-Z]$', '\1', 'g'
    );
$$;

-- Add generated oem_family column on oem_image_library (auto-backfills existing rows).
ALTER TABLE public.oem_image_library
  ADD COLUMN IF NOT EXISTS oem_family text GENERATED ALWAYS AS (public.normalize_oem_family(oem)) STORED;

CREATE INDEX IF NOT EXISTS idx_oem_image_library_family ON public.oem_image_library(oem_family);

-- Mirror on oem_cross_reference for equivalent lookups (best-effort, only if columns exist).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='oem_cross_reference' AND column_name='oem_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='oem_cross_reference' AND column_name='oem_family'
  ) THEN
    EXECUTE 'ALTER TABLE public.oem_cross_reference ADD COLUMN oem_family text GENERATED ALWAYS AS (public.normalize_oem_family(oem_code)) STORED';
    EXECUTE 'ALTER TABLE public.oem_cross_reference ADD COLUMN equivalent_family text GENERATED ALWAYS AS (public.normalize_oem_family(equivalent_code)) STORED';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_oem_xref_family ON public.oem_cross_reference(oem_family)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_oem_xref_eq_family ON public.oem_cross_reference(equivalent_family)';
  END IF;
END $$;
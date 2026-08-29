
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.oem_zip_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  default_brand TEXT,
  source_type TEXT NOT NULL DEFAULT 'manufacturer_catalog',
  source_name TEXT,
  total_entries INTEGER,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  zip_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_zip_jobs TO authenticated;
GRANT ALL ON public.oem_zip_jobs TO service_role;

ALTER TABLE public.oem_zip_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage zip jobs"
ON public.oem_zip_jobs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_oem_zip_jobs_user_created ON public.oem_zip_jobs(user_id, created_at DESC);
CREATE INDEX idx_oem_zip_jobs_status ON public.oem_zip_jobs(status);

CREATE TRIGGER update_oem_zip_jobs_updated_at
BEFORE UPDATE ON public.oem_zip_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

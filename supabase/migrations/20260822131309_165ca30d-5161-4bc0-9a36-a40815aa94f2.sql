CREATE TABLE public.oem_repository (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_code text NOT NULL,
  normalized_oem text NOT NULL,
  oem_brand text NOT NULL DEFAULT '',
  part_name text,
  manufacturer_brand text,
  manufacturer_code text,
  description text,
  technical_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  vehicle_compatibility jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'partsfinder',
  source_url text,
  match_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oem_repository_unique UNIQUE (normalized_oem, oem_brand)
);
GRANT SELECT ON public.oem_repository TO authenticated;
GRANT ALL ON public.oem_repository TO service_role;
ALTER TABLE public.oem_repository ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view oem repository" ON public.oem_repository FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX idx_oem_repository_norm ON public.oem_repository (normalized_oem);
CREATE INDEX idx_oem_repository_source ON public.oem_repository (source);
CREATE TRIGGER trg_oem_repository_updated BEFORE UPDATE ON public.oem_repository FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.oem_repository_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_repository_id uuid NOT NULL REFERENCES public.oem_repository(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  image_hash text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'partsfinder',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oem_repository_images_unique UNIQUE (oem_repository_id, image_hash)
);
GRANT SELECT ON public.oem_repository_images TO authenticated;
GRANT ALL ON public.oem_repository_images TO service_role;
ALTER TABLE public.oem_repository_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view oem repository images" ON public.oem_repository_images FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX idx_oem_repository_images_oem ON public.oem_repository_images (oem_repository_id);
CREATE TRIGGER trg_oem_repository_images_updated BEFORE UPDATE ON public.oem_repository_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partsfinder_collect_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'test',
  requested integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  saved integer NOT NULL DEFAULT 0,
  unavailable integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  new_oems integer NOT NULL DEFAULT 0,
  matched_oems integer NOT NULL DEFAULT 0,
  descriptions integer NOT NULL DEFAULT 0,
  images integer NOT NULL DEFAULT 0,
  vehicles integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  stopped_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partsfinder_collect_runs TO authenticated;
GRANT ALL ON public.partsfinder_collect_runs TO service_role;
ALTER TABLE public.partsfinder_collect_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view partsfinder collect runs" ON public.partsfinder_collect_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_pf_collect_runs_updated BEFORE UPDATE ON public.partsfinder_collect_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
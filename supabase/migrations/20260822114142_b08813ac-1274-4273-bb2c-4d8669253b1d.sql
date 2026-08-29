CREATE TABLE public.partsfinder_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'PARTSFINDER',
  product_url text NOT NULL,
  product_name text,
  brand text,
  manufacturer_code text,
  description text,
  technical_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  vehicle_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, product_url)
);

CREATE TABLE public.partsfinder_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.partsfinder_products(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  normalized_code text NOT NULL,
  reference_type text NOT NULL DEFAULT 'unknown',
  reference_brand text,
  is_oem boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, normalized_code, reference_brand)
);

CREATE TABLE public.partsfinder_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.partsfinder_products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  image_type text NOT NULL DEFAULT 'gallery',
  image_order int NOT NULL DEFAULT 0,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, image_url)
);

CREATE TABLE public.partsfinder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'default',
  search_type text NOT NULL DEFAULT 'oem',
  query text,
  status text NOT NULL DEFAULT 'idle',
  total_products int NOT NULL DEFAULT 0,
  scanned_count int NOT NULL DEFAULT 0,
  success_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  oem_count int NOT NULL DEFAULT 0,
  reference_count int NOT NULL DEFAULT 0,
  image_count int NOT NULL DEFAULT 0,
  pending_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  done_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_url text,
  last_page int NOT NULL DEFAULT 0,
  next_page_url text,
  last_error text,
  test_passed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

CREATE TABLE public.partsfinder_sessions (
  user_id uuid PRIMARY KEY,
  username text,
  cookie text NOT NULL,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partsfinder_products TO authenticated;
GRANT SELECT ON public.partsfinder_references TO authenticated;
GRANT SELECT ON public.partsfinder_images TO authenticated;
GRANT SELECT ON public.partsfinder_jobs TO authenticated;
GRANT ALL ON public.partsfinder_products TO service_role;
GRANT ALL ON public.partsfinder_references TO service_role;
GRANT ALL ON public.partsfinder_images TO service_role;
GRANT ALL ON public.partsfinder_jobs TO service_role;
GRANT ALL ON public.partsfinder_sessions TO service_role;

ALTER TABLE public.partsfinder_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partsfinder_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partsfinder_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partsfinder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partsfinder_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pf_products_admin_read" ON public.partsfinder_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "pf_refs_admin_read" ON public.partsfinder_references FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "pf_images_admin_read" ON public.partsfinder_images FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "pf_jobs_admin_read" ON public.partsfinder_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_pf_refs_norm ON public.partsfinder_references (normalized_code);
CREATE INDEX idx_pf_products_mcode ON public.partsfinder_products (manufacturer_code);

CREATE TRIGGER trg_pf_products_updated BEFORE UPDATE ON public.partsfinder_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pf_jobs_updated BEFORE UPDATE ON public.partsfinder_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
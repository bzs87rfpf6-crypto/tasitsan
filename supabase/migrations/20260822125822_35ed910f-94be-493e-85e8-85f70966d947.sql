-- 1) Katalog kaynakları
CREATE TABLE public.partsfinder_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'partsfinder',
  catalog_url text NOT NULL UNIQUE,
  catalog_type text NOT NULL DEFAULT 'sitemap',
  lang text,
  segment text,
  brand text,
  url_count integer NOT NULL DEFAULT 0,
  product_url_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partsfinder_catalogs TO authenticated;
GRANT ALL ON public.partsfinder_catalogs TO service_role;
ALTER TABLE public.partsfinder_catalogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_catalogs_admin_all" ON public.partsfinder_catalogs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2) Keşif kuyruğu
CREATE TABLE public.partsfinder_discovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'partsfinder',
  source_url text NOT NULL UNIQUE,
  catalog_id uuid REFERENCES public.partsfinder_catalogs(id) ON DELETE SET NULL,
  brand text,
  manufacturer_code text,
  segment text,
  lang text,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pf_queue_status ON public.partsfinder_discovery_queue (status, priority, discovered_at);
CREATE INDEX idx_pf_queue_brand ON public.partsfinder_discovery_queue (brand);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partsfinder_discovery_queue TO authenticated;
GRANT ALL ON public.partsfinder_discovery_queue TO service_role;
ALTER TABLE public.partsfinder_discovery_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_queue_admin_all" ON public.partsfinder_discovery_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 3) Araç uyumluluğu
CREATE TABLE public.partsfinder_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.partsfinder_products(id) ON DELETE CASCADE,
  vehicle_make text,
  vehicle_model text,
  vehicle_submodel text,
  vehicle_engine text,
  vehicle_fuel text,
  year_from text,
  year_to text,
  source text NOT NULL DEFAULT 'partsfinder',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pf_vehicles_product ON public.partsfinder_vehicles (product_id);
CREATE UNIQUE INDEX uq_pf_vehicles_row ON public.partsfinder_vehicles
  (product_id, coalesce(vehicle_make,''), coalesce(vehicle_model,''), coalesce(vehicle_submodel,''), coalesce(vehicle_engine,''), coalesce(year_from,''), coalesce(year_to,''));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partsfinder_vehicles TO authenticated;
GRANT ALL ON public.partsfinder_vehicles TO service_role;
ALTER TABLE public.partsfinder_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_vehicles_admin_all" ON public.partsfinder_vehicles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4) Mevcut tablolara alan eklemeleri
ALTER TABLE public.partsfinder_products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS collect_status text NOT NULL DEFAULT 'collected',
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.partsfinder_images
  ADD COLUMN IF NOT EXISTS image_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pf_images_hash ON public.partsfinder_images (product_id, image_hash) WHERE image_hash IS NOT NULL;

-- 5) updated_at tetikleyicileri
CREATE TRIGGER trg_pf_catalogs_updated BEFORE UPDATE ON public.partsfinder_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pf_queue_updated BEFORE UPDATE ON public.partsfinder_discovery_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
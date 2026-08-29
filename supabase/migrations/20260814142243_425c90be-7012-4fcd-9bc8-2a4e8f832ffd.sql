
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  supplier_type text NOT NULL DEFAULT 'original',
  product_type text NOT NULL DEFAULT 'Orijinal',
  active boolean NOT NULL DEFAULT true,
  login_url text,
  search_url_template text,
  username text,
  password_secret_key text,
  default_margin numeric(6,2) NOT NULL DEFAULT 25,
  min_stock integer NOT NULL DEFAULT 1,
  last_connected_at timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.supplier_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_oems integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  found_count integer NOT NULL DEFAULT 0,
  in_stock_count integer NOT NULL DEFAULT 0,
  out_of_stock_count integer NOT NULL DEFAULT 0,
  not_found_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  margin numeric(6,2) NOT NULL DEFAULT 25,
  min_stock integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'running',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_scan_jobs TO authenticated;
GRANT ALL ON public.supplier_scan_jobs TO service_role;
ALTER TABLE public.supplier_scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier scan jobs" ON public.supplier_scan_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.supplier_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.supplier_scan_jobs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  oem text NOT NULL,
  oem_norm text NOT NULL,
  status text NOT NULL,
  product_name text,
  brand text,
  supplier_product_code text,
  stock_quantity integer,
  supplier_price numeric(12,2),
  sale_price numeric(12,2),
  product_url text,
  gtin text,
  image_url text,
  error_message text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  imported_part_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_scan_results_job_idx ON public.supplier_scan_results(job_id);
CREATE INDEX supplier_scan_results_oem_idx ON public.supplier_scan_results(oem_norm);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_scan_results TO authenticated;
GRANT ALL ON public.supplier_scan_results TO service_role;
ALTER TABLE public.supplier_scan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier scan results" ON public.supplier_scan_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.supplier_scan_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.supplier_scan_jobs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  oem text,
  error_type text NOT NULL DEFAULT 'unknown',
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_scan_errors_job_idx ON public.supplier_scan_errors(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_scan_errors TO authenticated;
GRANT ALL ON public.supplier_scan_errors TO service_role;
ALTER TABLE public.supplier_scan_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier scan errors" ON public.supplier_scan_errors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_code text,
  ADD COLUMN IF NOT EXISTS product_quality text,
  ADD COLUMN IF NOT EXISTS gtin text,
  ADD COLUMN IF NOT EXISTS stock_status text;
CREATE INDEX IF NOT EXISTS parts_supplier_idx ON public.parts(supplier_id, supplier_product_code);

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_supplier_scan_jobs_updated_at BEFORE UPDATE ON public.supplier_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.suppliers (name, supplier_type, product_type, active, default_margin)
VALUES ('OnlineParça', 'original', 'Orijinal', true, 25)
ON CONFLICT (name) DO NOTHING;

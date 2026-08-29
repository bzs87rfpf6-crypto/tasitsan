
CREATE TABLE public.oem_image_update_log (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts(id) on delete cascade,
  oem text not null,
  oem_normalized text,
  brand_part text,
  brand_source text,
  title_part text,
  title_source text,
  similarity numeric(4,3),
  old_image_url text,
  new_image_url text,
  extra_images text[] not null default '{}',
  source_type text not null default 'bayramoto',
  source_url text,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

CREATE INDEX oem_image_update_log_part_idx ON public.oem_image_update_log(part_id);
CREATE INDEX oem_image_update_log_oem_idx ON public.oem_image_update_log(oem_normalized);
CREATE INDEX oem_image_update_log_created_idx ON public.oem_image_update_log(created_at DESC);
CREATE INDEX oem_image_update_log_status_idx ON public.oem_image_update_log(status);

GRANT SELECT, INSERT ON public.oem_image_update_log TO authenticated;
GRANT ALL ON public.oem_image_update_log TO service_role;

ALTER TABLE public.oem_image_update_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_log" ON public.oem_image_update_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_insert_log" ON public.oem_image_update_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.open_part_requests AS
  SELECT id, part_name, search_query, oem_code, brand, model, year, category,
         description, message, photos, status, city, engine_code, created_at,
         is_urgent, vehicle_class, machine_subcategory
  FROM public.part_requests
  WHERE status = ANY (ARRAY['new','in_progress'])
    AND deleted_at IS NULL
    AND is_active = true;

GRANT SELECT ON public.open_part_requests TO anon, authenticated;
DROP VIEW IF EXISTS public.open_part_requests;
CREATE VIEW public.open_part_requests
  WITH (security_invoker = true) AS
  SELECT id, part_name, search_query, oem_code, brand, model, year, category,
         description, message, photos, status, city, engine_code, created_at,
         is_urgent, vehicle_class, machine_subcategory
  FROM public.part_requests
  WHERE status = ANY (ARRAY['new','in_progress'])
    AND deleted_at IS NULL
    AND is_active = true;

GRANT SELECT ON public.open_part_requests TO anon, authenticated;
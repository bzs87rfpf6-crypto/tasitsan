GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.xml_admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.xml_admin_overview() TO service_role;
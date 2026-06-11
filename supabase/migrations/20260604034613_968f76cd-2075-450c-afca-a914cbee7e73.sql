
REVOKE EXECUTE ON FUNCTION public.notify_admin_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_new_listing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_urgent_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_new_quote() FROM PUBLIC, anon, authenticated;

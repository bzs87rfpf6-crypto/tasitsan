
REVOKE EXECUTE ON FUNCTION public.evaluate_part_stock(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stock_dashboard_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.evaluate_part_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_dashboard_stats() TO authenticated;

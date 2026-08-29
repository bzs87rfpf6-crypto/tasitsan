CREATE OR REPLACE FUNCTION public.guest_welcome_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'brand_count', (SELECT count(DISTINCT NULLIF(brand,'')) FROM parts WHERE status='approved' AND brand IS NOT NULL),
    'model_count', (SELECT count(DISTINCT NULLIF(model,'')) FROM parts WHERE status='approved' AND model IS NOT NULL),
    'active_parts', (SELECT count(*) FROM parts WHERE status='approved'),
    'last24h_new', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '24 hours'),
    'last24h_views', (SELECT count(*) FROM part_views WHERE created_at >= now() - interval '24 hours'),
    'total_stock_value', COALESCE((
      SELECT sum( COALESCE(price,0) * GREATEST(COALESCE(stock_quantity,1),1) )
      FROM parts WHERE status='approved' AND price IS NOT NULL
    ), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.guest_welcome_stats() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_part_stock(_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part           public.parts%ROWTYPE;
  v_oem_searches   bigint := 0;
  v_part_requests  bigint := 0;
  v_part_views     bigint := 0;
  v_similar_count  bigint := 0;
  v_market_avg     numeric;
  v_market_median  numeric;
  v_market_min     numeric;
  v_market_max     numeric;
  v_demand_score   integer := 0;
  v_age_days       integer := 0;
  v_rec_low        numeric;
  v_rec_high       numeric;
  v_recommendation text;
BEGIN
  SELECT * INTO v_part FROM public.parts WHERE id = _part_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  IF NOT (auth.uid() = v_part.seller_id OR has_role(auth.uid(),'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_age_days := GREATEST(0, (now()::date - v_part.created_at::date));

  IF array_length(v_part.oem_codes,1) IS NOT NULL THEN
    SELECT count(*) INTO v_oem_searches
      FROM public.oem_searches s
     WHERE s.created_at >= now() - interval '90 days'
       AND s.oem = ANY(v_part.oem_codes);
  END IF;

  SELECT count(*) INTO v_part_requests
    FROM public.part_requests pr
   WHERE pr.created_at >= now() - interval '90 days'
     AND pr.status IN ('new','in_progress')
     AND (
       (v_part.oem_code IS NOT NULL AND pr.oem_code = v_part.oem_code)
       OR (v_part.brand IS NOT NULL AND pr.brand ILIKE v_part.brand
           AND (v_part.model IS NULL OR pr.model ILIKE v_part.model))
       OR (v_part.category IS NOT NULL AND pr.category ILIKE v_part.category)
     );

  SELECT count(*) INTO v_part_views
    FROM public.part_views pv
   WHERE pv.part_id = _part_id
     AND pv.created_at >= now() - interval '90 days';

  IF array_length(v_part.oem_codes,1) IS NOT NULL THEN
    WITH sim AS (
      SELECT p.price
        FROM public.parts p
       WHERE p.id <> _part_id
         AND p.status = 'approved'
         AND p.price IS NOT NULL
         AND p.oem_codes && v_part.oem_codes
    )
    SELECT count(*),
           avg(price)::numeric(12,2),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric(12,2),
           min(price), max(price)
      INTO v_similar_count, v_market_avg, v_market_median, v_market_min, v_market_max
      FROM sim;
  END IF;

  v_demand_score := LEAST(100, GREATEST(0,
    (LEAST(v_oem_searches,  50) * 1.2)::int +
    (LEAST(v_part_requests, 25) * 2.0)::int +
    (LEAST(v_part_views,   100) * 0.3)::int
  ));

  IF v_market_median IS NOT NULL THEN
    IF v_demand_score >= 70 THEN
      v_rec_low  := round(v_market_median * 0.95, 2);
      v_rec_high := round(v_market_median * 1.15, 2);
    ELSIF v_demand_score >= 40 THEN
      v_rec_low  := round(v_market_median * 0.90, 2);
      v_rec_high := round(v_market_median * 1.05, 2);
    ELSE
      v_rec_low  := round(v_market_median * 0.80, 2);
      v_rec_high := round(v_market_median * 0.95, 2);
    END IF;
  END IF;

  IF v_age_days >= 60 THEN
    IF v_demand_score < 30 THEN
      v_recommendation := 'Bu ilan 60+ gündür satılmadı ve talep düşük. Fiyatı %15-20 düşürmeyi veya açıklama/fotoğrafları yenilemeyi öneririz.';
    ELSIF v_part.price IS NOT NULL AND v_market_median IS NOT NULL AND v_part.price > v_market_median * 1.1 THEN
      v_recommendation := 'Fiyatınız piyasa ortalamasının üzerinde. Piyasa medyanına yakın bir fiyat satışı hızlandırabilir.';
    ELSE
      v_recommendation := 'İlan görünürlüğünü artırmak için fotoğraf güncelleyin veya OEM kodlarını çoğaltın.';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'part_id',           v_part.id,
    'age_days',          v_age_days,
    'search_count',      v_oem_searches,
    'request_count',     v_part_requests,
    'view_count',        v_part_views,
    'similar_count',     v_similar_count,
    'market_avg',        v_market_avg,
    'market_median',     v_market_median,
    'market_min',        v_market_min,
    'market_max',        v_market_max,
    'demand_score',      v_demand_score,
    'price',             v_part.price,
    'recommended_low',   v_rec_low,
    'recommended_high',  v_rec_high,
    'recommendation',    v_recommendation,
    'is_stale',          (v_age_days >= 60)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_most_searched   jsonb;
  v_fastest_selling jsonb;
  v_slow_moving     jsonb;
  v_top_vehicles    jsonb;
  v_stale_recs      jsonb;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH top_oem AS (
    SELECT upper(trim(s.oem)) AS oem, count(*)::bigint AS search_count
      FROM public.oem_searches s
     WHERE s.created_at >= now() - interval '30 days'
     GROUP BY 1
     ORDER BY search_count DESC
     LIMIT 20
  ),
  matched AS (
    SELECT t.oem, t.search_count,
           (SELECT count(*) FROM public.parts p
              WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)) AS listing_count,
           (SELECT jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price)
              FROM public.parts p
             WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)
             ORDER BY p.created_at DESC LIMIT 1) AS sample
      FROM top_oem t
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'oem', oem, 'search_count', search_count,
    'listing_count', listing_count, 'sample', sample
  )), '[]'::jsonb) INTO v_most_searched FROM matched;

  WITH recent_views AS (
    SELECT pv.part_id, count(*)::bigint AS views_7d
      FROM public.part_views pv
     WHERE pv.created_at >= now() - interval '7 days'
     GROUP BY pv.part_id
     ORDER BY views_7d DESC LIMIT 10
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'brand', p.brand, 'model', p.model,
    'price', p.price, 'views_7d', rv.views_7d
  ) ORDER BY rv.views_7d DESC), '[]'::jsonb)
    INTO v_fastest_selling
    FROM recent_views rv JOIN public.parts p ON p.id = rv.part_id
    WHERE p.status = 'approved';

  WITH slow AS (
    SELECT p.id, p.title, p.brand, p.model, p.price, p.city, p.seller_id, p.created_at,
           (now()::date - p.created_at::date) AS age_days,
           (SELECT count(*) FROM public.part_views pv
              WHERE pv.part_id = p.id AND pv.created_at >= now() - interval '30 days') AS views_30d
      FROM public.parts p
     WHERE p.status = 'approved'
       AND p.created_at < now() - interval '60 days'
     ORDER BY (now()::date - p.created_at::date) DESC
     LIMIT 25
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'brand', brand, 'model', model,
    'price', price, 'city', city, 'age_days', age_days, 'views_30d', views_30d,
    'recommendation',
      CASE WHEN views_30d < 5 THEN 'Fiyatı %15 düşürmeyi veya fotoğrafları yenilemeyi deneyin.'
           WHEN views_30d < 15 THEN 'Açıklama ve OEM kodlarını güncelleyerek görünürlüğü artırın.'
           ELSE 'Talep var ancak satış yok; iletişim bilgilerini kontrol edin.' END
  )), '[]'::jsonb)
    INTO v_stale_recs
    FROM slow;

  v_slow_moving := COALESCE((
    SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
          FROM jsonb_array_elements(v_stale_recs) AS elem
         LIMIT 10
      ) s
  ), '[]'::jsonb);

  WITH demands AS (
    SELECT lower(coalesce(pr.brand,'')) AS brand,
           lower(coalesce(pr.model,'')) AS model,
           count(*)::bigint AS demand_count
      FROM public.part_requests pr
     WHERE pr.created_at >= now() - interval '90 days'
       AND pr.status IN ('new','in_progress')
       AND (pr.brand IS NOT NULL OR pr.model IS NOT NULL)
     GROUP BY 1,2
     ORDER BY demand_count DESC LIMIT 10
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'brand', initcap(brand), 'model', initcap(model), 'demand_count', demand_count
  )), '[]'::jsonb) INTO v_top_vehicles FROM demands;

  RETURN jsonb_build_object(
    'most_searched',   v_most_searched,
    'fastest_selling', v_fastest_selling,
    'slow_moving',     v_slow_moving,
    'top_vehicles',    v_top_vehicles,
    'stale_recs',      v_stale_recs
  );
END;
$$;

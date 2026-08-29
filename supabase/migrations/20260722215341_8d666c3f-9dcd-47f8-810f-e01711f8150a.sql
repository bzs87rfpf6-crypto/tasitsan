
DROP FUNCTION IF EXISTS public.ai_search_stats(integer);

CREATE FUNCTION public.ai_search_stats(_days integer DEFAULT 7)
 RETURNS TABLE(
   total_searches bigint, successful bigint, no_results bigint,
   avg_confidence numeric, click_through bigint, requests_created bigint,
   purchases bigint, success_rate numeric, ctr numeric, conversion_rate numeric,
   avg_response_ms numeric, cache_hit_rate numeric,
   semantic_match_rate numeric, clarification_rate numeric,
   sales_from_ai bigint
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
  WITH win AS (
    SELECT * FROM public.ai_search_logs
    WHERE created_at >= now() - (_days || ' days')::interval
      AND deleted_at IS NULL
  ),
  agg AS (
    SELECT
      COUNT(*)::BIGINT total,
      COUNT(*) FILTER (WHERE parts_found > 0)::BIGINT ok,
      COUNT(*) FILTER (WHERE parts_found = 0)::BIGINT empty,
      COALESCE(AVG(confidence), 0)::NUMERIC avg_conf,
      COUNT(*) FILTER (WHERE clicked_part_id IS NOT NULL)::BIGINT clicks,
      COUNT(*) FILTER (WHERE request_created)::BIGINT reqs,
      COUNT(*) FILTER (WHERE purchase_completed)::BIGINT buys,
      COALESCE(AVG(duration_ms), 0)::NUMERIC avg_ms,
      COUNT(*) FILTER (WHERE cache_hit)::BIGINT cache_hits,
      COUNT(*) FILTER (WHERE stage_reached = 'semantic')::BIGINT sem,
      COUNT(*) FILTER (WHERE clarification_shown)::BIGINT clar
    FROM win
  )
  SELECT total, ok, empty, ROUND(avg_conf,1),
    clicks, reqs, buys,
    CASE WHEN total>0 THEN ROUND((ok::NUMERIC/total)*100,1) ELSE 0 END,
    CASE WHEN ok>0 THEN ROUND((clicks::NUMERIC/ok)*100,1) ELSE 0 END,
    CASE WHEN total>0 THEN ROUND(((reqs+buys)::NUMERIC/total)*100,1) ELSE 0 END,
    ROUND(avg_ms,0),
    CASE WHEN total>0 THEN ROUND((cache_hits::NUMERIC/total)*100,1) ELSE 0 END,
    CASE WHEN ok>0 THEN ROUND((sem::NUMERIC/ok)*100,1) ELSE 0 END,
    CASE WHEN total>0 THEN ROUND((clar::NUMERIC/total)*100,1) ELSE 0 END,
    buys
  FROM agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_part_alerts_on_approve() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; n_title text; n_body text;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;
  FOR a IN
    SELECT id, user_id, keyword, brand, model, oem_code, category
    FROM public.part_alerts
    WHERE is_active = true
      AND (brand IS NULL OR NEW.brand ILIKE '%' || brand || '%')
      AND (model IS NULL OR NEW.model ILIKE '%' || model || '%')
      AND (category IS NULL OR NEW.category ILIKE '%' || category || '%')
      AND (oem_code IS NULL OR NEW.oem_code ILIKE '%' || oem_code || '%'
           OR (NEW.oem_codes IS NOT NULL AND oem_code = ANY(NEW.oem_codes)))
      AND (keyword IS NULL OR NEW.title ILIKE '%' || keyword || '%'
           OR NEW.description ILIKE '%' || keyword || '%')
  LOOP
    n_title := 'Beklediğin parça yayında: ' || COALESCE(NEW.title, 'Yeni ilan');
    n_body  := COALESCE(NEW.brand,'') || ' ' || COALESCE(NEW.model,'') ||
               CASE WHEN NEW.year IS NOT NULL THEN ' ' || NEW.year::text ELSE '' END;
    INSERT INTO public.user_notifications (user_id, kind, title, body, link)
    VALUES (a.user_id, 'part_alert', n_title, n_body,
      '/parts/' || COALESCE(NEW.seo_slug, NEW.id::text));
    UPDATE public.part_alerts
    SET match_count = COALESCE(match_count,0) + 1, last_matched_at = now()
    WHERE id = a.id;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_part_alerts ON public.parts;
CREATE TRIGGER trg_match_part_alerts
AFTER INSERT OR UPDATE OF status ON public.parts
FOR EACH ROW EXECUTE FUNCTION public.match_part_alerts_on_approve();

CREATE OR REPLACE FUNCTION public.oem_knowledge_card(_oem text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE
  norm text := upper(regexp_replace(_oem, '[^A-Za-z0-9]', '', 'g'));
  ref RECORD; compat_vehicles jsonb; alt_oems text[];
  brands text[]; cats text[]; cnt integer;
BEGIN
  IF length(norm) < 3 THEN RETURN NULL; END IF;
  SELECT part_name, category, notes, confidence, verified,
         alternative_oems, cross_reference, compatible_oems
  INTO ref
  FROM public.oem_reference
  WHERE upper(regexp_replace(oem, '[^A-Za-z0-9]', '', 'g')) = norm
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'brand', brand, 'model', model,
    'year_from', year_from, 'year_to', year_to,
    'engine', engine_code, 'fuel', fuel)), '[]'::jsonb)
  INTO compat_vehicles
  FROM public.oem_reference
  WHERE upper(regexp_replace(oem, '[^A-Za-z0-9]', '', 'g')) = norm AND brand IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT ao), '{}'::text[])
  INTO alt_oems
  FROM public.oem_reference r,
       unnest(COALESCE(r.alternative_oems,'{}') || COALESCE(r.cross_reference,'{}') || COALESCE(r.compatible_oems,'{}')) ao
  WHERE upper(regexp_replace(r.oem, '[^A-Za-z0-9]', '', 'g')) = norm;

  SELECT COALESCE(array_agg(DISTINCT brand) FILTER (WHERE brand IS NOT NULL), '{}'::text[]),
         COALESCE(array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL), '{}'::text[]),
         COUNT(*)::int
  INTO brands, cats, cnt
  FROM public.parts
  WHERE status = 'approved' AND stock_quantity > 0
    AND (upper(regexp_replace(COALESCE(oem_code,''), '[^A-Za-z0-9]', '', 'g')) = norm
         OR EXISTS (SELECT 1 FROM unnest(COALESCE(oem_codes,'{}')) x
                    WHERE upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')) = norm));

  RETURN jsonb_build_object(
    'oem', _oem, 'oem_normalized', norm,
    'part_name', ref.part_name,
    'category', COALESCE(ref.category, (SELECT c FROM unnest(cats) c LIMIT 1)),
    'notes', ref.notes,
    'verified', COALESCE(ref.verified, false),
    'confidence', ref.confidence,
    'compatible_vehicles', COALESCE(compat_vehicles, '[]'::jsonb),
    'alternative_oems', COALESCE(alt_oems, '{}'::text[]),
    'equivalent_brands', COALESCE(brands, '{}'::text[]),
    'category_hints', COALESCE(cats, '{}'::text[]),
    'available_products', COALESCE(cnt, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.oem_knowledge_card(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cross_sell_for_part(_part_id uuid, _limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, seo_slug text, title text, brand text, model text, year integer,
   category text, oem_code text, oem_codes text[], price numeric, city text,
   photos text[], stock_quantity integer, seller_id uuid, score integer, reason text)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE src RECORD;
BEGIN
  SELECT p.brand, p.model, p.year, p.category, p.seller_id
  INTO src FROM public.parts p WHERE p.id = _part_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT p.id, p.seo_slug, p.title, p.brand, p.model, p.year, p.category,
           p.oem_code, p.oem_codes, p.price, p.city, p.photos,
           p.stock_quantity, p.seller_id,
           ((CASE WHEN p.brand ILIKE src.brand THEN 40 ELSE 0 END) +
            (CASE WHEN p.model ILIKE src.model THEN 30 ELSE 0 END) +
            (CASE WHEN p.category IS DISTINCT FROM src.category THEN 15 ELSE 0 END) +
            (CASE WHEN p.year = src.year THEN 10 ELSE 0 END) +
            (CASE WHEN p.seller_id = src.seller_id THEN 5 ELSE 0 END))::int AS score,
           CASE
             WHEN p.category IS DISTINCT FROM src.category AND p.brand ILIKE src.brand
               THEN 'Aynı araç · farklı parça'
             WHEN p.category = src.category THEN 'Benzer kategori'
             ELSE 'İlgili ürün'
           END AS reason
    FROM public.parts p
    WHERE p.id <> _part_id AND p.status = 'approved' AND p.stock_quantity > 0
      AND (p.brand ILIKE src.brand OR p.model ILIKE src.model)
  )
  SELECT id, seo_slug, title, brand, model, year, category, oem_code, oem_codes,
         price, city, photos, stock_quantity, seller_id, score, reason
  FROM candidates
  WHERE score > 0
  ORDER BY score DESC, id
  LIMIT _limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cross_sell_for_part(uuid, integer) TO anon, authenticated;

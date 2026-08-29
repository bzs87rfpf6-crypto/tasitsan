CREATE OR REPLACE FUNCTION public.brand_slug(_brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(_brand,''), 'ÇĞİIıÖŞÜçğıiöşü', 'CGIIIOSUcgiiosu')),
    '[^a-z0-9]+', '-', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.seo_brand_index(_min_count integer DEFAULT 3)
 RETURNS TABLE(brand text, slug text, total bigint, with_photo bigint, last_updated timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (
    select public.brand_slug(brand) as slug,
           (array_agg(btrim(brand) order by length(brand)))[1] as brand,
           count(*)::bigint as total,
           count(*) filter (where coalesce(has_photos,false))::bigint as with_photo,
           max(updated_at) as last_updated
    from public.parts
    where status = 'approved'
      and seo_slug is not null
      and brand is not null and length(public.brand_slug(brand)) > 0
    group by public.brand_slug(brand)
  )
  select brand, slug, total, with_photo, last_updated
  from b
  where total >= _min_count
  order by total desc;
$function$;

CREATE OR REPLACE FUNCTION public.seo_brand_landing(_brand text, _limit integer DEFAULT 24)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target as (
    select public.brand_slug(_brand) as slug
  ),
  named as (
    select coalesce(
      (select btrim(p.brand) from public.parts p, target t
        where p.status='approved' and public.brand_slug(p.brand) = t.slug
        group by btrim(p.brand) order by count(*) desc limit 1),
      _brand
    ) as brand
  ),
  agg as (
    select count(*)::bigint as total,
           count(*) filter (where coalesce(p.has_photos,false))::bigint as with_photo,
           max(p.updated_at) as last_updated
    from public.parts p, target t
    where p.status='approved' and public.brand_slug(p.brand) = t.slug
  ),
  models as (
    select p.model, count(*)::bigint as cnt
    from public.parts p, target t
    where p.status='approved' and public.brand_slug(p.brand) = t.slug
      and p.model is not null and length(btrim(p.model)) > 0
    group by p.model order by cnt desc limit 20
  ),
  top_parts as (
    select p.id, p.title, p.brand, p.model, p.year, p.oem_code, p.oem_codes,
           p.price, p.photos, p.seo_slug, p.has_photos
    from public.parts p, target t
    where p.status='approved' and public.brand_slug(p.brand) = t.slug
    order by coalesce(p.has_photos,false) desc, p.updated_at desc
    limit _limit
  )
  select json_build_object(
    'brand', (select brand from named),
    'total', coalesce((select total from agg), 0),
    'with_photo', coalesce((select with_photo from agg), 0),
    'last_updated', (select last_updated from agg),
    'models', coalesce((select json_agg(json_build_object('model',model,'count',cnt)) from models), '[]'::json),
    'parts', coalesce((select json_agg(row_to_json(top_parts)) from top_parts), '[]'::json)
  );
$function$;
CREATE OR REPLACE FUNCTION public.seo_brand_index(_min_count integer DEFAULT 3)
 RETURNS TABLE(brand text, slug text, total bigint, with_photo bigint, last_updated timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (
    select btrim(brand) as brand,
           count(*)::bigint as total,
           count(*) filter (where coalesce(has_photos,false))::bigint as with_photo,
           max(updated_at) as last_updated
    from public.parts
    where status = 'approved'
      and seo_slug is not null
      and brand is not null and length(btrim(brand)) > 0
    group by btrim(brand)
  )
  select brand,
         lower(regexp_replace(
           translate(brand,
             'ÇĞİıÖŞÜçğıiöşü ',
             'CGIIOSUcgiiosu-'),
           '[^a-z0-9-]+', '-', 'g')) as slug,
         total, with_photo, last_updated
  from b
  where total >= _min_count
  order by total desc;
$function$;
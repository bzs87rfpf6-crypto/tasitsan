
create or replace function public.seo_brand_index(_min_count integer default 3)
returns table (brand text, slug text, total bigint, with_photo bigint, last_updated timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select btrim(brand) as brand,
           count(*)::bigint as total,
           count(*) filter (where coalesce(has_photos,false))::bigint as with_photo,
           max(updated_at) as last_updated
    from public.parts
    where status = 'active'
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
$$;

create or replace function public.seo_brand_landing(_brand text, _limit integer default 24)
returns json
language sql stable security definer set search_path = public as $$
  with target as (
    select coalesce(
      (select brand from public.parts
        where status='active' and lower(btrim(brand)) = lower(btrim(_brand))
        group by brand order by count(*) desc limit 1),
      _brand
    ) as brand
  ),
  agg as (
    select t.brand,
           count(*)::bigint as total,
           count(*) filter (where coalesce(p.has_photos,false))::bigint as with_photo,
           max(p.updated_at) as last_updated
    from public.parts p, target t
    where p.status='active' and lower(btrim(p.brand)) = lower(btrim(t.brand))
    group by t.brand
  ),
  models as (
    select p.model, count(*)::bigint as cnt
    from public.parts p, target t
    where p.status='active' and lower(btrim(p.brand)) = lower(btrim(t.brand))
      and p.model is not null and length(btrim(p.model)) > 0
    group by p.model order by cnt desc limit 20
  ),
  top_parts as (
    select p.id, p.title, p.brand, p.model, p.year, p.oem_code, p.oem_codes,
           p.price, p.photos, p.seo_slug, p.has_photos
    from public.parts p, target t
    where p.status='active' and lower(btrim(p.brand)) = lower(btrim(t.brand))
    order by coalesce(p.has_photos,false) desc, p.updated_at desc
    limit _limit
  )
  select json_build_object(
    'brand', (select brand from target),
    'total', coalesce((select total from agg), 0),
    'with_photo', coalesce((select with_photo from agg), 0),
    'last_updated', (select last_updated from agg),
    'models', coalesce((select json_agg(json_build_object('model',model,'count',cnt)) from models), '[]'::json),
    'parts', coalesce((select json_agg(row_to_json(top_parts)) from top_parts), '[]'::json)
  );
$$;

grant execute on function public.seo_brand_index(integer) to anon, authenticated, service_role;
grant execute on function public.seo_brand_landing(text, integer) to anon, authenticated, service_role;

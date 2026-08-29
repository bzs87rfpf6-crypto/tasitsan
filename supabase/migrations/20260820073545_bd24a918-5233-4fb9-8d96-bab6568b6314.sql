with agg as (
  select l.category_slug, l.category_name,
         count(p.id)::int as listings,
         count(distinct lower(btrim(p.brand)))::int as brands,
         count(distinct upper(btrim(coalesce(p.oem_code,''))))::int as oems,
         max(p.updated_at) as last_updated
  from public.seo_category_landing l
  left join public.parts p
    on p.status='approved' and p.category = l.category_name
  group by l.category_slug, l.category_name
)
update public.seo_category_landing l
set listings_count = a.listings,
    distinct_brands = a.brands,
    distinct_oems = a.oems,
    quality_score = least(100, greatest(0, round(a.listings*0.6 + a.brands*2 + a.oems*0.5)))::int,
    indexable = (least(100, greatest(0, round(a.listings*0.6 + a.brands*2 + a.oems*0.5))) >= 40 and a.listings >= 6),
    updated_at = now()
from agg a
where a.category_slug = l.category_slug;
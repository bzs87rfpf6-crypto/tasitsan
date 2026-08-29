create or replace function public.fuzzy_word_hit(_doc text, _t text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select exists (
    select 1
    from unnest(string_to_array(regexp_replace(coalesce(_doc, ''), '[^a-z0-9]+', ' ', 'g'), ' ')) w
    where length(w) >= 3
      and least(
        extensions.levenshtein(left(w, length(_t)), _t),
        extensions.levenshtein(left(w, length(_t) + 1), _t),
        extensions.levenshtein(w, _t)
      ) <= case when length(_t) <= 4 then 1 else 2 end
  )
$$;

grant execute on function public.fuzzy_word_hit(text, text) to anon, authenticated, service_role;

create or replace function public.search_parts_family(
  _tokens text[] default '{}'::text[],
  _q text default null,
  _limit int default 24,
  _offset int default 0,
  _brand text default null,
  _city text default null,
  _min_price numeric default null,
  _max_price numeric default null,
  _condition text default null,
  _in_stock boolean default null,
  _with_photo boolean default null
)
returns table (
  id uuid,
  seo_slug text,
  title text,
  brand text,
  model text,
  year integer,
  price numeric,
  city text,
  photos text[],
  condition text,
  part_type text,
  stock_quantity integer,
  oem_code text,
  oem_codes text[],
  created_at timestamptz,
  has_photos boolean,
  is_sold boolean,
  supplier_stock boolean,
  minimum_order_amount numeric,
  single_shipment_allowed boolean,
  procurement_days integer,
  score numeric,
  match_kind text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
with toks as (
  select distinct lower(t) as t
  from unnest(coalesce(_tokens, '{}'::text[])) t
  where length(trim(t)) >= 2
),
qn as (
  select nullif(regexp_replace(upper(coalesce(_q, '')), '[^A-Z0-9]', '', 'g'), '') as code
),
base as (
  select p.*
  from public.parts p
  where p.status = 'approved'
    and (_brand is null or p.brand ilike '%' || _brand || '%')
    and (_city is null or p.city ilike '%' || _city || '%')
    and (_min_price is null or p.price >= _min_price)
    and (_max_price is null or p.price <= _max_price)
    and (_condition is null or p.condition = _condition)
    and (_in_stock is not true or coalesce(p.stock_quantity, 0) > 0)
    and (_with_photo is not true or coalesce(p.has_photos, false) = true)
),
strict_m as (
  select b.*, 'direct'::text as match_kind
  from base b
  where (select count(*) from toks) = 0
     or not exists (
       select 1 from toks
       where coalesce(b.search_doc, '') not like '%' || toks.t || '%'
     )
),
fuzzy_m as (
  select b.*, 'fuzzy'::text as match_kind
  from base b
  where (select count(*) from toks) > 0
    and not exists (select 1 from strict_m offset 7)
    and not exists (
      select 1 from toks
      where not (
        coalesce(b.search_doc, '') like '%' || toks.t || '%'
        or (length(toks.t) >= 4 and public.fuzzy_word_hit(b.search_doc, toks.t))
      )
    )
),
core as (
  select * from strict_m
  union all
  select * from fuzzy_m f where not exists (select 1 from strict_m s where s.id = f.id)
),
partial_m as (
  select b.*, 'partial'::text as match_kind
  from base b
  where (select count(*) from toks) >= 2
    and not exists (select 1 from core offset 4)
    and not exists (select 1 from core c where c.id = b.id)
    and (
      select count(*) from toks t
      where coalesce(b.search_doc, '') like '%' || t.t || '%'
    ) >= greatest(2, ceil((select count(*) from toks) * 0.6)::int)
  limit 40
),
matched as (
  select * from core
  union all
  select * from partial_m
),
fam_codes as (
  select distinct c
  from matched m, unnest(coalesce(m.oem_norm, '{}'::text[])) c
  where length(c) >= 5
  limit 60
),
family as (
  select b.*, 'family'::text as match_kind
  from base b
  where exists (select 1 from fam_codes)
    and b.oem_norm && (select array_agg(c) from fam_codes)
    and not exists (select 1 from matched m where m.id = b.id)
  limit 60
),
pool as (
  select * from matched
  union all
  select * from family
),
scored as (
  select
    p.*,
    (
      case when (select code from qn) is not null
            and (select code from qn) = any(coalesce(p.oem_norm, '{}'::text[])) then 1000 else 0 end
      + case when (select code from qn) is not null
              and exists (
                select 1 from unnest(coalesce(p.oem_norm, '{}'::text[])) c
                where c like '%' || (select code from qn) || '%'
              ) then 400 else 0 end
      + case when _q is not null and coalesce(p.search_doc, '') like '%' || lower(_q) || '%' then 250 else 0 end
      + case when p.match_kind = 'family' then 100 else 0 end
      + case when p.match_kind = 'fuzzy' then -40 else 0 end
      + case when p.match_kind = 'partial' then -150 else 0 end
      + coalesce((
          select sum(
            case
              when lower(coalesce(p.title, '')) like '%' || t.t || '%' then 60
              when lower(coalesce(p.brand, '') || ' ' || coalesce(p.model, '')) like '%' || t.t || '%' then 40
              when coalesce(p.search_doc, '') like '%' || t.t || '%' then 25
              else 12
            end
          )
          from toks t
        ), 0)
      + case when coalesce(p.has_photos, false) then 20 else 0 end
      + case when coalesce(p.stock_quantity, 0) > 0 then 12 else 0 end
      + case when coalesce(p.is_sold, false) then -60 else 0 end
    )::numeric as score
  from pool p
)
select
  s.id, s.seo_slug, s.title, s.brand, s.model, s.year, s.price, s.city, s.photos,
  s.condition, s.part_type, s.stock_quantity, s.oem_code, s.oem_codes, s.created_at,
  s.has_photos, s.is_sold, s.supplier_stock, s.minimum_order_amount,
  s.single_shipment_allowed, s.procurement_days,
  s.score, s.match_kind,
  count(*) over () as total_count
from scored s
order by s.score desc, coalesce(s.has_photos, false) desc, s.created_at desc
limit greatest(coalesce(_limit, 24), 1)
offset greatest(coalesce(_offset, 0), 0)
$$;

grant execute on function public.search_parts_family(text[], text, int, int, text, text, numeric, numeric, text, boolean, boolean) to anon, authenticated, service_role;
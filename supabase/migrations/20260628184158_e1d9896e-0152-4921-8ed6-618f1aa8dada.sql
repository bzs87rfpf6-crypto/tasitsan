
create or replace function public.enqueue_indexnow_for_part_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := 'https://tasitsan.com.tr';
  slug text;
begin
  slug := coalesce(old.seo_slug, old.id::text);
  insert into public.indexnow_queue (url)
  values (base || '/parts/' || slug)
  on conflict (url) where status='pending' do nothing;

  if old.oem_code is not null and length(old.oem_code) >= 3 then
    insert into public.indexnow_queue (url)
    values (base || '/oem/' || lower(regexp_replace(old.oem_code,'[^A-Za-z0-9]','-','g')))
    on conflict (url) where status='pending' do nothing;
  end if;
  return old;
end$$;

drop trigger if exists trg_parts_indexnow_delete on public.parts;
create trigger trg_parts_indexnow_delete
  after delete on public.parts
  for each row execute function public.enqueue_indexnow_for_part_delete();

create or replace function public.seo_health_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select * from public.parts where status='active'
  ),
  dup as (
    select count(*)::bigint as cnt from (
      select lower(btrim(title)) t, count(*) c
      from p
      where title is not null
      group by 1 having count(*) > 1
    ) d
  )
  select jsonb_build_object(
    'active_total', (select count(*)::bigint from p),
    'missing_photo', (select count(*)::bigint from p where coalesce(has_photos,false)=false),
    'missing_description', (select count(*)::bigint from p where description is null or length(btrim(description)) < 30),
    'missing_oem', (select count(*)::bigint from p where (oem_code is null or length(oem_code)<3) and (oem_codes is null or array_length(oem_codes,1) is null)),
    'missing_brand_model', (select count(*)::bigint from p where brand is null or model is null),
    'missing_seo_slug', (select count(*)::bigint from p where seo_slug is null or length(seo_slug)<3),
    'duplicate_title_groups', (select cnt from dup),
    'noindex_pages', (select count(*)::bigint from p where stock_quantity is null or stock_quantity <= 0),
    'oem_indexable', (select count(distinct oem_code)::bigint from p where oem_code is not null and length(oem_code)>=3),
    'brand_indexable', (select count(distinct lower(btrim(brand)))::bigint from p where brand is not null)
  );
$$;

grant execute on function public.seo_health_overview() to authenticated, service_role;

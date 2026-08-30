-- Self-host: yönetici sahibini kendi Supabase projenizdeki kullanıcıya taşır.
--
-- Lovable Cloud kurulumundaki migration'lar tek yönetici UUID'sini
-- (c1258e23-…) sabitliyor. Kendi projenizde (ör. wulismufjcmddflhlptp)
-- kullanıcı UUID'niz farklıdır; tüm migration'ları uyguladıktan SONRA bu
-- dosyayı bir kez çalıştırın.
--
-- Kullanım (SQL Editor veya psql):
--   1) Aşağıdaki :owner_id değerini kendi auth.users UUID'nizle değiştirin
--      (SELECT id, email FROM auth.users ORDER BY created_at;)
--   2) Dosyanın tamamını çalıştırın.
--   3) Uygulamanın .env dosyasına aynı UUID'yi yazın:
--        ADMIN_OWNER_USER_ID=...
--        VITE_ADMIN_OWNER_USER_ID=...
--      (VITE_ değeri build zamanında gömülür → yeniden build gerekir.)

DO $$
DECLARE
  owner_id uuid := '00000000-0000-0000-0000-000000000000';  -- << BURAYI DEĞİŞTİRİN
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_id) THEN
    RAISE EXCEPTION 'owner_id auth.users içinde bulunamadı: %', owner_id;
  END IF;

  -- 1) Tek-sahip CHECK kısıtı
  EXECUTE 'ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_single_admin_owner';
  EXECUTE format(
    'ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_single_admin_owner CHECK ('
    || 'role NOT IN (''admin''::public.app_role, ''super_admin''::public.app_role) OR user_id = %L::uuid)',
    owner_id);

  -- 2) has_role: admin/super_admin yalnızca sahibe döner
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT CASE
        WHEN _role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
          AND _user_id <> %L::uuid
        THEN false
        ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
      END
    $body$;
  $f$, owner_id);

  EXECUTE 'REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role';

  -- 3) user_roles RLS politikaları
  EXECUTE 'DROP POLICY IF EXISTS "Single admin owner can read all roles" ON public.user_roles';
  EXECUTE 'DROP POLICY IF EXISTS "Single admin owner manages non-admin roles" ON public.user_roles';

  EXECUTE format($p$
    CREATE POLICY "Single admin owner can read all roles"
    ON public.user_roles FOR SELECT TO authenticated
    USING (auth.uid() = %L::uuid AND public.has_role(auth.uid(), 'admin'::public.app_role));
  $p$, owner_id);

  EXECUTE format($p$
    CREATE POLICY "Single admin owner manages non-admin roles"
    ON public.user_roles FOR ALL TO authenticated
    USING (auth.uid() = %L::uuid AND public.has_role(auth.uid(), 'admin'::public.app_role)
           AND role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role))
    WITH CHECK (auth.uid() = %L::uuid AND public.has_role(auth.uid(), 'admin'::public.app_role)
           AND role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role));
  $p$, owner_id, owner_id);

  -- 4) Sahibe admin rolünü ver
  INSERT INTO public.user_roles (user_id, role)
  VALUES (owner_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

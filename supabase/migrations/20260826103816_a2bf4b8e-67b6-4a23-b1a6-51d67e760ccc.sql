DROP POLICY IF EXISTS "Admins manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Single admin owner can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Single admin owner manages non-admin roles" ON public.user_roles;

CREATE POLICY "Single admin owner can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = 'c1258e23-db3b-4368-bd81-84f2665fa48c'::uuid
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Single admin owner manages non-admin roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  auth.uid() = 'c1258e23-db3b-4368-bd81-84f2665fa48c'::uuid
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role)
)
WITH CHECK (
  auth.uid() = 'c1258e23-db3b-4368-bd81-84f2665fa48c'::uuid
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role)
);
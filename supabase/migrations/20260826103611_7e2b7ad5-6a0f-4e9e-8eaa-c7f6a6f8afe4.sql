ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_single_admin_owner;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_single_admin_owner
  CHECK (
    role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role)
    OR user_id = 'c1258e23-db3b-4368-bd81-84f2665fa48c'::uuid
  );

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
      AND _user_id <> 'c1258e23-db3b-4368-bd81-84f2665fa48c'::uuid
    THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
  END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
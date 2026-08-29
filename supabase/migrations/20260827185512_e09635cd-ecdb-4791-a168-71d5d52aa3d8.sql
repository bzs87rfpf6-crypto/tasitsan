CREATE OR REPLACE FUNCTION public.admin_set_trusted_seller(_user_id uuid, _trusted boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _prev boolean;
BEGIN
  IF _actor IS NULL
     OR NOT (public.has_role(_actor, 'admin'::public.app_role)
             OR public.has_role(_actor, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT trusted_seller INTO _prev FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı';
  END IF;

  UPDATE public.profiles SET trusted_seller = _trusted WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, target_user_id, action, old_value, new_value)
  VALUES (
    _actor,
    _user_id,
    CASE WHEN _trusted THEN 'grant_trusted_seller' ELSE 'revoke_trusted_seller' END,
    jsonb_build_object('trusted_seller', _prev),
    jsonb_build_object('trusted_seller', _trusted)
  );

  RETURN _trusted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_trusted_seller(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_trusted_seller(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_trusted_seller(uuid, boolean) TO service_role;
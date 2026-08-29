CREATE OR REPLACE FUNCTION public.admin_edit_record(
  _table text,
  _id uuid,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_allowed text[];
  v_set text := '';
  v_key text;
  v_val jsonb;
  v_sql text;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _table NOT IN ('part_requests','request_quotes') THEN
    RAISE EXCEPTION 'invalid table';
  END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid patch';
  END IF;

  IF _table = 'part_requests' THEN
    v_allowed := ARRAY['part_name','brand','model','year','oem_code','city','status',
                       'full_name','phone','email','notes','category','description','is_active'];
    SELECT to_jsonb(pr.*) INTO v_old FROM public.part_requests pr WHERE id = _id;
  ELSE
    v_allowed := ARRAY['price','delivery_time','condition','note','status','is_active'];
    SELECT to_jsonb(rq.*) INTO v_old FROM public.request_quotes rq WHERE id = _id;
  END IF;
  IF v_old IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(_patch) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN CONTINUE; END IF;
    IF length(v_set) > 0 THEN v_set := v_set || ', '; END IF;
    v_set := v_set || format('%I = ($1->>%L)::', v_key, v_key);
    -- type cast per column
    IF v_key = 'year' THEN v_set := v_set || 'int';
    ELSIF v_key = 'price' THEN v_set := v_set || 'numeric';
    ELSIF v_key = 'is_active' THEN v_set := v_set || 'boolean';
    ELSE v_set := v_set || 'text';
    END IF;
  END LOOP;

  IF length(v_set) = 0 THEN RAISE EXCEPTION 'no editable fields'; END IF;

  v_sql := format('UPDATE public.%I SET %s WHERE id = %L RETURNING to_jsonb(%I.*)', _table, v_set, _id, _table);
  EXECUTE v_sql USING _patch INTO v_new;

  INSERT INTO public.admin_audit_log (actor_id, action, metadata, old_value)
  VALUES (v_actor, 'moderate_edit',
    jsonb_build_object('table', _table, 'id', _id, 'patch', _patch),
    v_old);

  RETURN v_new;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_edit_record(text, uuid, jsonb) TO authenticated;
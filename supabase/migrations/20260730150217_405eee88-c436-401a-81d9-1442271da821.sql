CREATE OR REPLACE FUNCTION public.tg_notify_pending_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.notify_pending_requests_for_part(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_pending_requests ON public.parts;
CREATE TRIGGER trg_notify_pending_requests
AFTER INSERT OR UPDATE OF status ON public.parts
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_pending_requests();
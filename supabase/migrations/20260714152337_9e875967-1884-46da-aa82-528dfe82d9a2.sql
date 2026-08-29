-- Enable Realtime for orders (dashboard cards + admin list live updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END $$;

-- FULL replica identity so UPDATE payloads carry all columns (status changes, tracking, etc.)
ALTER TABLE public.orders REPLICA IDENTITY FULL;
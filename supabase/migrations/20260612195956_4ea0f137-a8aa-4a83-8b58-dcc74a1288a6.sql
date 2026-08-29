ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'new_user','new_listing','urgent_request','new_quote','bulk_upload',
    'stok_new_listing','stok_expert_request','stok_offer','signup_failure'
  ]));
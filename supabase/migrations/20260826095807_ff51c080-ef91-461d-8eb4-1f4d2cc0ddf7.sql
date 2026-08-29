ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_check CHECK (kind = ANY (ARRAY['new_user','new_listing','urgent_request','new_quote','bulk_upload','stok_new_listing','stok_expert_request','stok_offer','signup_failure','new_order','order_updated','order_cancelled','live_chat_message']));

CREATE OR REPLACE FUNCTION public.live_chat_after_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  preview TEXT;
  v_recent INT;
BEGIN
  preview := COALESCE(NULLIF(btrim(NEW.message),''), CASE WHEN NEW.attachment_url IS NOT NULL THEN '[dosya]' ELSE '' END);
  IF NEW.sender_type = 'visitor' THEN
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          unread_admin = unread_admin + 1,
          status = CASE WHEN status = 'closed' THEN 'active' ELSE status END,
          updated_at = now()
      WHERE id = NEW.conversation_id;

    -- Yeni müşteri mesajı → yönetici bildirimi (push trigger'ı bunun üzerinden çalışır).
    -- De-dup: aynı sohbet için son 2 dakikada okunmamış bildirim varsa tekrar üretme.
    SELECT count(*) INTO v_recent
      FROM public.admin_notifications
     WHERE kind = 'live_chat_message'
       AND related_id = NEW.conversation_id
       AND read_at IS NULL
       AND created_at > now() - interval '2 minutes';

    IF v_recent = 0 THEN
      INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id)
      VALUES (
        'live_chat_message',
        'high',
        'Yeni müşteri mesajı',
        LEFT(NULLIF(preview,''), 140),
        '/admin/live-support?c=' || NEW.conversation_id::text,
        NEW.conversation_id
      );
    END IF;
  ELSIF NEW.sender_type = 'admin' THEN
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          unread_visitor = unread_visitor + 1,
          status = CASE WHEN status IN ('waiting','closed') THEN 'active' ELSE status END,
          assigned_admin = COALESCE(assigned_admin, NEW.sender_id),
          updated_at = now()
      WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.live_chat_conversations
      SET last_message_at = NEW.created_at,
          last_message_preview = LEFT(preview, 200),
          updated_at = now()
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $function$;
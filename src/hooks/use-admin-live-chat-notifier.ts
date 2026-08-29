import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  playNotificationSound,
  isSoundEnabled,
  unlockNotificationAudio,
} from "@/lib/notification-sounds";

const LS_SEEN_KEY = "ts_lc_admin_seen_ids_v1";
const LS_UNREAD_KEY = "ts_lc_admin_unread_v1";

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LS_SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try {
    const arr = Array.from(s).slice(-500);
    localStorage.setItem(LS_SEEN_KEY, JSON.stringify(arr));
  } catch { /* noop */ }
}

/**
 * Global admin notifier for live-chat visitor messages.
 * - Realtime subscribe to live_chat_messages INSERT (visitor only).
 * - Toast + sound + browser notification.
 * - Maintains unread admin total (sum of unread_admin across conversations).
 * - Persists unread count so page refresh doesn't wipe the badge until data reloads.
 * - Dedups across tabs/admins via seen id set in localStorage.
 * - Skips notification when the corresponding conversation is currently open
 *   in this tab (see window.__lc_openConvId set by the live-support page).
 */
export function useAdminLiveChatNotifier(opts: { isAdmin: boolean }): { unreadTotal: number } {
  const { isAdmin } = opts;
  const [unreadTotal, setUnreadTotal] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const v = Number(localStorage.getItem(LS_UNREAD_KEY) || "0");
    return Number.isFinite(v) ? v : 0;
  });
  const seenRef = useRef<Set<string>>(loadSeen());

  // Persist unread total
  useEffect(() => {
    try { localStorage.setItem(LS_UNREAD_KEY, String(unreadTotal)); } catch { /* noop */ }
  }, [unreadTotal]);

  // Refetch total from DB
  const refreshTotal = async () => {
    const { data, error } = await supabase
      .from("live_chat_conversations")
      .select("unread_admin,status")
      .neq("status", "closed");
    if (error) { console.warn("[live-chat] unread total fetch failed", error); return; }
    const total = (data ?? []).reduce((a: number, r: { unread_admin: number | null }) => a + (r.unread_admin ?? 0), 0);
    setUnreadTotal(total);
  };

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    void refreshTotal();

    // Request notification permission (best effort)
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { void Notification.requestPermission(); } catch { /* noop */ }
    }
    // Unlock WebAudio on first user gesture
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const ch = supabase.channel("admin-live-chat-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat_messages" }, (p) => {
        const m = p.new as { id: string; conversation_id: string; sender_type: string; message: string | null; attachment_url: string | null };
        if (m.sender_type !== "visitor") return;
        // dedup: skip if we already notified for this message
        if (seenRef.current.has(m.id)) return;
        seenRef.current.add(m.id);
        saveSeen(seenRef.current);

        void refreshTotal();

        // Suppress notification for the currently open conversation in this tab
        const openId = (window as unknown as { __lc_openConvId?: string }).__lc_openConvId;
        const focused = typeof document !== "undefined" && document.hasFocus();
        if (openId === m.conversation_id && focused) return;

        try {
          const body = (m.message?.trim() || (m.attachment_url ? "[dosya]" : "Yeni mesaj")).slice(0, 140);
          if (isSoundEnabled()) playNotificationSound("new_inquiry");
          toast.message("💬 Yeni canlı destek mesajı", {
            description: body,
            action: {
              label: "Aç",
              onClick: () => { window.location.href = "/admin/live-support"; },
            },
          });
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && (document.hidden || !focused)) {
            const n = new Notification("Yeni canlı destek mesajı", { body, tag: `lc-${m.conversation_id}`, icon: "/icon-192.png" });
            n.onclick = () => { window.focus(); window.location.href = "/admin/live-support"; n.close(); };
          }
        } catch (e) {
          console.warn("[live-chat] notification failed", e);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_conversations" }, () => {
        void refreshTotal();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat_conversations" }, () => {
        void refreshTotal();
      })
      .subscribe();

    // Poll fallback every 60s (in case realtime blips)
    const iv = window.setInterval(() => void refreshTotal(), 60000);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.clearInterval(iv);
      void supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  return { unreadTotal };
}

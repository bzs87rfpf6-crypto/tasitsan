import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, BellOff, Volume2, VolumeX, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import {
  isSoundEnabled,
  setSoundEnabled,
  unlockNotificationAudio,
  playNotificationSound,
  type NotifSoundKind,
} from "@/lib/notification-sounds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface AdminNotif {
  id: string;
  kind: string;
  priority: "normal" | "high";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const SOUND_BY_KIND: Record<string, NotifSoundKind> = {
  new_user: "new_user",
  new_listing: "new_listing",
  urgent_request: "urgent_request",
  new_quote: "new_quote",
  bulk_upload: "bulk_upload",
  signup_failure: "signup_failure",
  system_error: "system_error",
  new_order: "new_quote",

};

export function AdminNotificationsBell() {
  const [items, setItems] = useState<AdminNotif[]>([]);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSound(isSoundEnabled());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("admin_notifications")
        .select("id,kind,priority,title,body,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const rows = (data ?? []) as AdminNotif[];
      setItems(rows);
      rows.forEach((r) => seenIds.current.add(r.id));
    })();

    const ch = supabase
      .channel("admin_notifications_bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const row = payload.new as AdminNotif;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setItems((prev) => [row, ...prev].slice(0, 50));
          playNotificationSound(SOUND_BY_KIND[row.kind] ?? "generic");
          const isOrder = row.kind === "new_order";
          toast[row.priority === "high" ? "error" : "success"](
            isOrder ? `🛒 ${row.title}` : row.title,
            {
              description: row.body ?? undefined,
              duration: row.priority === "high" ? 10000 : 6000,
              action: row.link
                ? { label: "Aç", onClick: () => { window.location.href = row.link!; } }
                : undefined,
            },
          );
        },

      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_notifications" },
        (payload) => {
          const row = payload.new as AdminNotif;
          setItems((prev) => prev.map((p) => (p.id === row.id ? row : p)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  // Unlock audio on first interaction anywhere.
  useEffect(() => {
    const handler = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  const unread = useMemo(() => items.filter((i) => !i.read_at), [items]);
  const hasUrgent = unread.some((i) => i.priority === "high");

  const markRead = async (id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((p) => p.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("admin_notifications").update({ read_at: now }).is("read_at", null);
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) {
      unlockNotificationAudio();
      playNotificationSound("generic");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center size-10 rounded-full border border-border bg-card/60 hover:bg-card transition-colors"
          aria-label="Bildirimler"
          onClick={() => unlockNotificationAudio()}
        >
          <Bell className="size-5 text-foreground" />
          {unread.length > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                hasUrgent ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-gold text-background"
              }`}
            >
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-semibold">
            Bildirimler {unread.length > 0 && <span className="text-gold">({unread.length})</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSound}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title={sound ? "Sesi kapat" : "Sesi aç"}
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            {unread.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={markAllRead}>
                <CheckCheck className="size-3.5 mr-1" /> Tümü
              </Button>
            )}
          </div>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              <BellOff className="size-6 mx-auto mb-2 opacity-50" />
              Bildirim yok
            </li>
          )}
          {items.map((n) => {
            const isUrgent = n.priority === "high";
            const isUnread = !n.read_at;
            const Wrapper: any = n.link ? Link : "div";
            const wrapProps = n.link ? { to: n.link, onClick: () => { setOpen(false); if (isUnread) markRead(n.id); } } : {};
            return (
              <li key={n.id} className={`px-3 py-2.5 ${isUrgent ? "bg-destructive/5" : isUnread ? "bg-gold/5" : ""}`}>
                <div className="flex items-start gap-2">
                  <Wrapper {...wrapProps} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      {isUnread && <span className={`size-1.5 rounded-full ${isUrgent ? "bg-destructive" : "bg-gold"}`} />}
                      <p className={`text-[13px] truncate ${isUnread ? "font-semibold" : ""}`}>{n.title}</p>
                    </div>
                    {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(n.created_at).toLocaleString("tr-TR")}
                    </p>
                  </Wrapper>
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className="shrink-0 p-1 text-muted-foreground hover:text-gold"
                      title="Okundu"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

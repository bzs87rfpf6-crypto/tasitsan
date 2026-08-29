import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Volume2, VolumeX, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  isSoundEnabled,
  setSoundEnabled,
  unlockNotificationAudio,
  playNotificationSound,
  type NotifSoundKind,
} from "@/lib/notification-sounds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface UserNotif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const KIND_TO_SOUND: Record<string, NotifSoundKind> = {
  new_inquiry: "new_inquiry",
  new_quote: "new_quote",
};

export function UserNotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserNotif[]>([]);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSound(isSoundEnabled());
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("id,kind,title,body,link,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      const rows = (data ?? []) as UserNotif[];
      setItems(rows);
      rows.forEach((r) => seenIds.current.add(r.id));
    })();

    const ch = supabase
      .channel(`user_notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as UserNotif;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setItems((prev) => [row, ...prev].slice(0, 30));
          playNotificationSound(KIND_TO_SOUND[row.kind] ?? "generic");
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    const handler = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  const unread = useMemo(() => items.filter((i) => !i.read_at), [items]);

  const markRead = async (id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
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

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center size-9 rounded-full border border-border bg-card/60 hover:bg-card transition-colors"
          aria-label="Bildirimler"
          onClick={() => unlockNotificationAudio()}
        >
          <Bell className="size-4 text-foreground" />
          {unread.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-gold text-background">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-semibold">Bildirimler</div>
          <button
            type="button"
            onClick={toggleSound}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            title={sound ? "Sesi kapat" : "Sesi aç"}
          >
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto divide-y divide-border">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              <BellOff className="size-5 mx-auto mb-2 opacity-50" />
              Henüz bildirim yok
            </li>
          )}
          {items.map((n) => {
            const isUnread = !n.read_at;
            const Wrap: any = n.link ? Link : "div";
            const wp = n.link ? { to: n.link, onClick: () => { setOpen(false); if (isUnread) markRead(n.id); } } : {};
            return (
              <li key={n.id} className={`px-3 py-2.5 ${isUnread ? "bg-gold/5" : ""}`}>
                <div className="flex items-start gap-2">
                  <Wrap {...wp} className="flex-1 min-w-0 text-left">
                    <p className={`text-[13px] ${isUnread ? "font-semibold" : ""}`}>{n.title}</p>
                    {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(n.created_at).toLocaleString("tr-TR")}
                    </p>
                  </Wrap>
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

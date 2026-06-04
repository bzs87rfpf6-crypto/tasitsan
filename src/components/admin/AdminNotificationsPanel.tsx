import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, AlertTriangle, UserPlus, Package, MessageSquareQuote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PushSubscribeButton } from "@/components/admin/PushSubscribeButton";

export interface AdminNotification {
  id: string;
  kind: "new_user" | "new_listing" | "urgent_request" | "new_quote";
  priority: "normal" | "high";
  title: string;
  body: string | null;
  link: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

const KIND_ICON = {
  new_user: UserPlus,
  new_listing: Package,
  urgent_request: AlertTriangle,
  new_quote: MessageSquareQuote,
} as const;

export function AdminNotificationsPanel() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error) setItems((data ?? []) as AdminNotification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin_notifications_panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notifications" },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  const markRead = async (id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((p) => p.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("admin_notifications").update({ read_at: now }).is("read_at", null);
  };

  const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-gold" />
          <h2 className="font-semibold text-sm">
            Bildirim Merkezi {unreadCount > 0 && <span className="text-gold">({unreadCount} okunmamış)</span>}
          </h2>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-[11px] rounded-full border ${filter === "all" ? "bg-gold text-background border-gold" : "border-border text-muted-foreground"}`}
          >
            Tümü
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`px-2.5 py-1 text-[11px] rounded-full border ${filter === "unread" ? "bg-gold text-background border-gold" : "border-border text-muted-foreground"}`}
          >
            Okunmamış
          </button>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={markAllRead}>
              <CheckCheck className="size-3.5 mr-1" /> Tümünü okudum
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <PushSubscribeButton />
      </div>


      {loading ? (
        <p className="text-xs text-muted-foreground">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {filter === "unread" ? "Okunmamış bildirim yok 🎉" : "Henüz bildirim yok."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Bell;
            const isUrgent = n.priority === "high";
            const unread = !n.read_at;
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                  isUrgent
                    ? "border-destructive/40 bg-destructive/5"
                    : unread
                      ? "border-gold/40 bg-gold/5"
                      : "border-border bg-card/50"
                }`}
              >
                <div
                  className={`shrink-0 size-9 rounded-lg flex items-center justify-center ${
                    isUrgent ? "bg-destructive/20 text-destructive" : "bg-gold/15 text-gold"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <button
                  onClick={() => {
                    if (unread) markRead(n.id);
                    if (n.link) nav({ to: n.link });
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${unread ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                    {isUrgent && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-destructive text-white">
                        Acil
                      </span>
                    )}
                    {unread && <span className="size-1.5 rounded-full bg-gold" />}
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground truncate">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {new Date(n.created_at).toLocaleString("tr-TR")}
                  </p>
                </button>
                {unread && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-gold"
                    title="Okundu işaretle"
                  >
                    <Check className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, AlertTriangle, Package, Wallet, Clock, Truck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminGetOrderStats } from "@/lib/orders.functions";

interface Stats {
  pending: number;
  urgent: number;
  todayCount: number;
  todayRevenue: number;
  quotePending: number;
  toShip: number;
}

const CARDS: { key: keyof Stats; label: string; icon: React.ComponentType<{ className?: string }>; accent: string; tab?: string; money?: boolean }[] = [
  { key: "pending", label: "Bekleyen Sipariş", icon: ShoppingCart, accent: "text-gold", tab: "orders" },
  { key: "urgent", label: "Acil Sipariş", icon: AlertTriangle, accent: "text-red-400", tab: "orders" },
  { key: "todayCount", label: "Bugünkü Sipariş", icon: Package, accent: "text-emerald-400", tab: "orders" },
  { key: "todayRevenue", label: "Bugünkü Ciro", icon: Wallet, accent: "text-gold", money: true },
  { key: "quotePending", label: "Teklif Bekleyen", icon: Clock, accent: "text-blue-400", tab: "orders" },
  { key: "toShip", label: "Kargoya Verilecek", icon: Truck, accent: "text-orange-400", tab: "orders" },
];

function money(n: number) {
  return `₺${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function OrderStatsCards({ onJump }: { onJump?: (tab: string) => void }) {
  const [s, setS] = useState<Stats>({ pending: 0, urgent: 0, todayCount: 0, todayRevenue: 0, quotePending: 0, toShip: 0 });
  const [loading, setLoading] = useState(true);
  const fetchStats = useServerFn(adminGetOrderStats);

  const load = useCallback(async () => {
    try {
      const res = await fetchStats();
      setS(res);
    } catch (e) {
      console.error("[OrderStatsCards] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStats]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => { void load(); }, 30000);
    const ch = supabase
      .channel(`dashboard_order_stats_${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { void load(); })
      .subscribe();
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [load]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {CARDS.map((c) => {
        const Icon = c.icon;
        const value = s[c.key];
        const label = c.money ? money(value) : String(value);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => c.tab && onJump?.(c.tab)}
            className="text-left bg-card border border-border rounded-xl p-3 hover:border-gold/40 transition"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
              <Icon className={`size-4 ${c.accent}`} />
            </div>
            <p className={`font-display text-xl ${c.accent}`}>{loading ? "…" : label}</p>
          </button>
        );
      })}
    </div>
  );
}

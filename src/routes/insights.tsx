import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, TrendingUp, Search, Users, ClipboardList, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { SafePartImage } from "@/components/SafePartImage";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Hazır Müşteri Fırsatları — Taşıtsan" }] }),
  component: InsightsPage,
});

type Range = "today" | "7d" | "30d";

interface SellerRow {
  part_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  photos: string[] | null;
  oem_codes: string[] | null;
  searches_7d: number;
  searches_30d: number;
  searches_today: number;
  active_requests: number;
  alert_watchers: number;
}

interface TopRow {
  oem: string;
  search_count: number;
  request_count: number;
  sample_title: string | null;
  sample_brand: string | null;
  sample_model: string | null;
  sample_part_id: string | null;
}

const RANGE_LABEL: Record<Range, string> = {
  today: "Bugün",
  "7d": "Son 7 gün",
  "30d": "Son 30 gün",
};

function InsightsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [range, setRange] = useState<Range>("7d");
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [top, setTop] = useState<TopRow[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  const load = useCallback(async (r: Range) => {
    if (!user) return;
    setBusy(true);
    const [{ data: insights }, { data: topData }] = await Promise.all([
      supabase.rpc("seller_demand_insights", { _range: r }),
      supabase.rpc("top_demand_parts", { _range: r, _limit: 12 }),
    ]);
    setRows((insights ?? []) as SellerRow[]);
    setTop((topData ?? []) as TopRow[]);
    setBusy(false);
  }, [user]);

  useEffect(() => { load(range); }, [load, range]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;

  const rangeKey = range === "today" ? "searches_today" : range === "7d" ? "searches_7d" : "searches_30d";

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Hazır Müşteri Fırsatları" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-5">
        <Link to="/account" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-3.5" /> Hesabım
        </Link>

        {/* Header card */}
        <div className="bg-gradient-to-br from-gold/20 via-gold/5 to-background border-2 border-gold/40 rounded-2xl p-4 shadow-gold">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="size-5 text-gold" />
            <h1 className="font-display text-lg tracking-wide text-gold">Hazır Müşteri Fırsatları</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            İlanlarınızı arayan, talep eden ve bildirim bekleyen alıcıları görün.
          </p>
        </div>

        {/* Range filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                range === r
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>

        {/* Per-listing insights */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <TrendingUp className="size-4" /> İlanlarınız ({rows.length})
          </h2>

          {busy ? (
            <p className="text-sm text-muted-foreground text-center py-6">Yükleniyor...</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 bg-card border border-border rounded-xl space-y-2">
              <p className="text-sm text-muted-foreground">Henüz ilanınız yok.</p>
              <Link to="/sell" className="inline-block text-gold font-semibold text-xs hover:underline">+ Yeni ilan oluştur</Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const hot = r[rangeKey] > 0 || r.active_requests > 0 || r.alert_watchers > 0;
                return (
                  <li key={r.part_id} className={`bg-card border rounded-xl p-3 ${hot ? "border-gold/50 shadow-gold/30" : "border-border"}`}>
                    <div className="flex gap-3">
                      <Link to="/parts/$id" params={{ id: r.part_id }} className="size-16 shrink-0 rounded-lg overflow-hidden bg-secondary block">
                        <SafePartImage images={r.photos} alt={r.title} width={128} className="w-full h-full object-cover" />
                      </Link>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <h3 className="text-sm font-semibold leading-tight line-clamp-2">{r.title}</h3>
                        {(r.brand || r.model) && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {[r.brand, r.model].filter(Boolean).join(" • ")}
                          </p>
                        )}
                        {r.oem_codes && r.oem_codes.length > 0 && (
                          <p className="text-[10px] font-mono text-gold/90 line-clamp-1">OEM: {r.oem_codes.slice(0, 2).join(", ")}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Stat icon={<Search className="size-3.5" />} label="Bu hafta arama" value={r.searches_7d} accent="gold" />
                      <Stat icon={<Search className="size-3.5" />} label="Bu ay arama" value={r.searches_30d} accent="muted" />
                      <Stat icon={<ClipboardList className="size-3.5" />} label="Aktif talep" value={r.active_requests} accent={r.active_requests > 0 ? "emerald" : "muted"} />
                      <Stat icon={<Users className="size-3.5" />} label="Bildirim bekleyen" value={r.alert_watchers} accent={r.alert_watchers > 0 ? "sky" : "muted"} />
                    </div>

                    {(r.active_requests > 0 || r.alert_watchers > 0) && (
                      <p className="text-[11px] text-gold mt-2 font-medium">
                        🔥 {r.active_requests + r.alert_watchers} potansiyel müşteri bu parçayı arıyor!
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top demand */}
        <section className="space-y-3 pt-2">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <Flame className="size-4" /> En Çok Aranan Parçalar — {RANGE_LABEL[range]}
          </h2>

          {busy ? (
            <p className="text-sm text-muted-foreground text-center py-6">Yükleniyor...</p>
          ) : top.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Bu dönemde arama kaydı yok.</p>
          ) : (
            <ul className="space-y-2">
              {top.map((t, i) => {
                const name = [t.sample_brand, t.sample_model, t.sample_title].filter(Boolean).join(" ") || t.oem;
                const inner = (
                  <div className="bg-card border border-border hover:border-gold rounded-xl p-3 flex items-center gap-3">
                    <span className="size-7 shrink-0 rounded-full bg-gold/10 text-gold font-bold text-xs grid place-items-center">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight line-clamp-1">{name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground line-clamp-1">OEM: {t.oem}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gold leading-none">{t.search_count}</p>
                      <p className="text-[10px] text-muted-foreground">arama</p>
                      {t.request_count > 0 && (
                        <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">{t.request_count} talep</p>
                      )}
                    </div>
                  </div>
                );
                return (
                  <li key={t.oem}>
                    {t.sample_part_id ? (
                      <Link to="/parts/$id" params={{ id: t.sample_part_id }} className="block">{inner}</Link>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}

function Stat({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: number;
  accent: "gold" | "emerald" | "sky" | "muted";
}) {
  const cls =
    accent === "gold" ? "text-gold border-gold/40 bg-gold/5"
    : accent === "emerald" ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/5"
    : accent === "sky" ? "text-sky-400 border-sky-400/40 bg-sky-400/5"
    : "text-muted-foreground border-border bg-background";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className="text-base font-bold leading-tight mt-0.5">{value}</p>
    </div>
  );
}

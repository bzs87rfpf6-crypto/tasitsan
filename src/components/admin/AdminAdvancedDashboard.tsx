import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Users, Package, Eye, Phone, MessageCircle, TrendingUp, Search, Building2, BadgeCheck } from "lucide-react";
import { getAdminDashboardOverview } from "@/lib/admin-dashboard.functions";

function StatCard({ icon: Icon, label, value, hint, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
        <Icon className={`size-3.5 ${accent ?? "text-gold"}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-display text-xl text-foreground">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function AdminAdvancedDashboard() {
  const fetchOverview = useServerFn(getAdminDashboardOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="text-center text-muted-foreground text-sm py-6">Analitik yükleniyor...</p>;
  }
  if (error || !data) {
    return <p className="text-center text-destructive text-sm py-6">Analitik alınamadı.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">📊 Genel Bakış</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={Users} label="Toplam Üye" value={data.total_members.toLocaleString("tr-TR")} hint={`+${data.new_members_30d} son 30 gün`} />
          <StatCard icon={BadgeCheck} label="Doğrulanmış Satıcı" value={data.verified_sellers.toLocaleString("tr-TR")} accent="text-sky-400" />
          <StatCard icon={Building2} label="Aktif Satıcı" value={data.active_sellers.toLocaleString("tr-TR")} hint="en az 1 ürünü olan" />
          <StatCard icon={Package} label="Toplam Ürün" value={data.total_parts.toLocaleString("tr-TR")} hint={`+${data.parts_today} bugün`} />
          <StatCard icon={Eye} label="Bugün Görüntülenme" value={data.today_views.toLocaleString("tr-TR")} accent="text-emerald-400" />
          <StatCard icon={MessageCircle} label="Bugün WhatsApp" value={data.today_whatsapp.toLocaleString("tr-TR")} accent="text-emerald-400" />
          <StatCard icon={Phone} label="Bugün Arama" value={data.today_calls.toLocaleString("tr-TR")} accent="text-emerald-400" />
        </div>
      </div>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="size-3.5" /> En Aktif 20 Firma
        </h3>
        {data.active_firms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">Henüz veri yok.</p>
        ) : (
          <ul className="bg-card border border-border rounded-xl divide-y divide-border">
            {data.active_firms.map((f, i) => (
              <li key={f.seller_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-[11px] text-muted-foreground">{i + 1}.</span>
                <Link to="/u/$id" params={{ id: f.seller_id }} className="flex-1 min-w-0 hover:text-gold">
                  <span className="block truncate font-medium">
                    {f.display_name}
                    {f.is_verified && <BadgeCheck className="inline size-3.5 text-sky-400 ml-1 -mt-0.5" />}
                  </span>
                  {f.city && <span className="block text-[10px] text-muted-foreground truncate">{f.city}</span>}
                </Link>
                <div className="text-right text-[11px]">
                  <div className="text-gold font-bold">{f.total_parts}</div>
                  <div className="text-muted-foreground">
                    {f.active_parts} aktif · {f.pending_parts} bek.
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center gap-1.5">
          <Eye className="size-3.5" /> En Çok Görüntülenen 20 Firma (30 gün)
        </h3>
        {data.viewed_firms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">Profil görüntülenme verisi henüz toplanmadı. Ziyaretçiler satıcı profillerini açtıkça burada görünecek.</p>
        ) : (
          <ul className="bg-card border border-border rounded-xl divide-y divide-border">
            {data.viewed_firms.map((f, i) => (
              <li key={f.seller_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-[11px] text-muted-foreground">{i + 1}.</span>
                <Link to="/u/$id" params={{ id: f.seller_id }} className="flex-1 min-w-0 hover:text-gold">
                  <span className="block truncate font-medium">
                    {f.display_name}
                    {f.is_verified && <BadgeCheck className="inline size-3.5 text-sky-400 ml-1 -mt-0.5" />}
                  </span>
                  {f.city && <span className="block text-[10px] text-muted-foreground truncate">{f.city}</span>}
                </Link>
                <div className="text-emerald-400 font-bold text-[11px]">{f.views_30d}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section>
          <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center gap-1.5">
            <Search className="size-3.5" /> En Çok Aranan OEM
          </h3>
          {data.top_oem.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">Veri yok.</p>
          ) : (
            <ul className="bg-card border border-border rounded-xl divide-y divide-border text-xs">
              {data.top_oem.map((o) => (
                <li key={o.oem} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 font-mono truncate">{o.oem}</span>
                  <span className="text-gold font-bold">{o.search_count}</span>
                  <span className="text-[10px] text-muted-foreground">{o.listing_count} ilan</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wider text-gold font-semibold mb-2 flex items-center gap-1.5">
            <Search className="size-3.5" /> En Çok Aranan Ürün
          </h3>
          {data.top_searches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">Veri yok.</p>
          ) : (
            <ul className="bg-card border border-border rounded-xl divide-y divide-border text-xs">
              {data.top_searches.map((q) => (
                <li key={q.query} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 truncate">{q.query}</span>
                  <span className="text-gold font-bold">{q.search_count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Flame, Search, PlusCircle, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEMAND_TIER_META, tierOfScore } from "@/lib/demand";

export const Route = createFileRoute("/firsatlar")({
  head: () => {
    const url = "https://www.tasitsan.com.tr/firsatlar";
    const title = "Talep Borsası — Aranan Yedek Parçalar | Taşıtsan";
    const description =
      "Alıcıların Taşıtsan'da aradığı ama bulamadığı yedek parçaları görün. Fırsat puanı, aranma sayısı ve trend artışıyla stoğunuzu doğru ürünle doldurun.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: DemandExchangePage,
});

type Row = {
  id: string;
  oem_code: string | null;
  keyword: string | null;
  part_name: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  vehicle_class: string | null;
  search_count: number;
  unique_users: number;
  count_7d: number;
  count_30d: number;
  in_stock_count: number;
  score: number;
  tier: string;
  status: string;
  last_seen_at: string;
};

function DemandExchangePage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    const { data } = await supabase.rpc("demand_opportunities", {
      _limit: 100,
      _search: search.trim() || undefined,
      _only_missing: onlyMissing,
    });
    setRows((data ?? []) as Row[]);
    setBusy(false);
  }, [search, onlyMissing]);

  useEffect(() => {
    if (!user) { setBusy(false); return; }
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [user, load]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <header className="space-y-1">
          <h1 className="font-display text-xl flex items-center gap-2">
            <Flame className="size-5 text-gold" />
            Talep Borsası
          </h1>
          <p className="text-xs text-muted-foreground">
            Alıcıların aradığı ama sistemde bulunmayan parçalar. Fırsat puanı yüksek ürünleri stoğuna ekleyerek
            hazır talebe ilk sen ulaş.
          </p>
        </header>

        {authLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
        ) : !user ? (
          <div className="rounded-xl border border-border bg-card/60 p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Talep Borsası satıcılara özeldir. Gerçek kullanıcı taleplerini görmek için giriş yap.
            </p>
            <Button asChild className="h-9"><Link to="/auth" rel="nofollow">Giriş Yap</Link></Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="OEM, ürün veya marka ara…"
                  className="h-9 pl-9"
                  maxLength={60}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={() => void load()}>
                <RefreshCw className="size-3.5" />
              </Button>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="accent-[hsl(var(--gold))]"
              />
              Sadece stokta olmayan talepleri göster
            </label>

            {busy ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Talepler yükleniyor…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Şu anda gösterilecek talep yok. Yeni aramalar geldikçe bu liste otomatik dolar.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const meta = DEMAND_TIER_META[tierOfScore(r.score)];
                  const label = r.part_name || r.keyword || r.oem_code || "—";
                  return (
                    <article key={r.id} className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold truncate">{label}</h2>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {r.oem_code && <span className="font-mono">{r.oem_code}</span>}
                            {r.brand ? ` · ${r.brand}` : ""}
                            {r.model ? ` ${r.model}` : ""}
                            {r.category ? ` · ${r.category}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                          {meta.icon} {meta.label} · {r.score}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center">
                        <Stat label="Aranma" value={r.search_count} />
                        <Stat label="Kişi" value={r.unique_users} />
                        <Stat label="7 gün" value={r.count_7d} />
                        <Stat label="Stok" value={r.in_stock_count} />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Son aranma: {new Date(r.last_seen_at).toLocaleString("tr-TR")}
                          {r.status === "fulfilled" && <span className="text-emerald-400 font-semibold"> · Karşılandı</span>}
                        </span>
                        <Button asChild size="sm" className="h-8 text-xs">
                          <Link
                            to="/sell"
                            search={{
                              oem: r.oem_code ?? undefined,
                              title: r.part_name ?? r.keyword ?? undefined,
                              brand: r.brand ?? undefined,
                              model: r.model ?? undefined,
                              category: r.category ?? undefined,
                            } as never}
                          >
                            <PlusCircle className="size-3.5 mr-1" /> Bu Ürünü Ekle
                          </Link>
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border py-1.5">
      <p className="text-sm font-bold">{value.toLocaleString("tr-TR")}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

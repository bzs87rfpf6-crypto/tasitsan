import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  Search, MapPin, Package, HandCoins, Plus, ImageIcon, FileText,
  ShieldCheck, CircleDot, BadgeCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { listPublicStok, type PublicStokListing } from "@/lib/stok-public.functions";

const SITE_URL = "https://www.tasitsan.com.tr";

const stokQuery = queryOptions({
  queryKey: ["stok", "public", "list"],
  queryFn: () => listPublicStok({ data: { limit: 120 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/stok/")({
  head: () => ({
    meta: [
      { title: "Stok Borsası — Toplu Yedek Parça İlanları | Taşıtsan" },
      { name: "description", content: "Depolardaki atıl ve toplu yedek parça stoklarını keşfedin, doğrudan teklif verin. Ekspertizli ve Taşıtsan onaylı stoklar." },
      { property: "og:title", content: "Taşıtsan Stok Borsası" },
      { property: "og:description", content: "Toplu yedek parça ilanları ve teklif sistemi." },
      { property: "og:url", content: `${SITE_URL}/stok` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/stok` }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Taşıtsan Stok Borsası",
        url: `${SITE_URL}/stok`,
        description: "Toplu yedek parça stok ilanları",
      }),
    }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(stokQuery),
  errorComponent: ({ error }) => {
    console.error("[stok] load failed", error);
    return <p className="p-6 text-center text-sm text-muted-foreground">Liste şu anda yüklenemedi. Lütfen sayfayı yenileyin.</p>;
  },

  notFoundComponent: () => <p className="p-6 text-center text-sm">Bulunamadı.</p>,
  component: StokListPage,
});

type SortKey = "newest" | "price_asc" | "price_desc" | "items_desc";

function StokListPage() {
  const { data: rows } = useSuspenseQuery(stokQuery);
  return <StokListView rows={rows} />;
}

function StokListView({ rows }: { rows: PublicStokListing[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minItems, setMinItems] = useState("");
  const [expertOnly, setExpertOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "offer_collecting">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const cities = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.city && s.add(r.city));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "tr"));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    const mi = minItems ? Number(minItems) : null;
    let out = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (city && r.city !== city) return false;
      if (expertOnly && !r.expert_requested && !r.expert_completed) return false;
      if (min !== null && (r.expected_price ?? 0) < min) return false;
      if (max !== null && (r.expected_price ?? Number.MAX_SAFE_INTEGER) > max) return false;
      if (mi !== null && (r.estimated_item_count ?? 0) < mi) return false;
      if (needle) {
        const hay = `${r.title} ${r.description ?? ""} ${r.city ?? ""} ${r.seller.company_name ?? ""}`.toLocaleLowerCase("tr");
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "price_asc": return (a.expected_price ?? Infinity) - (b.expected_price ?? Infinity);
        case "price_desc": return (b.expected_price ?? -Infinity) - (a.expected_price ?? -Infinity);
        case "items_desc": return (b.estimated_item_count ?? 0) - (a.estimated_item_count ?? 0);
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return out;
  }, [rows, q, city, minPrice, maxPrice, minItems, expertOnly, statusFilter, sort]);

  return (
    <div className="min-h-dvh bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-3 py-4 space-y-4">
        <header className="flex items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">Stok Borsası</h1>
            <p className="text-xs text-muted-foreground">Toplu yedek parça stokları — teklif ver, anlaş.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                toast.info("İlan vermek için giriş yapın");
                navigate({ to: "/auth" });
                return;
              }
              navigate({ to: "/account/stok", search: { tab: "create" } });
            }}
            className="inline-flex items-center gap-1 bg-gold text-background font-semibold text-xs px-3 py-2 rounded-lg hover:opacity-90 active:scale-95 transition">
            <Plus className="size-3.5" /> İlan Ver
          </button>
        </header>

        <section className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Başlık, açıklama, şehir veya firma ara…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={city} onChange={(e) => setCity(e.target.value)}
              className="bg-background border border-border rounded-lg px-2 py-2 text-xs">
              <option value="">Tüm şehirler</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min ₺" className="bg-background border border-border rounded-lg px-2 py-2 text-xs" />
            <input type="number" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max ₺" className="bg-background border border-border rounded-lg px-2 py-2 text-xs" />
            <input type="number" inputMode="numeric" value={minItems} onChange={(e) => setMinItems(e.target.value)}
              placeholder="Min ürün adedi" className="bg-background border border-border rounded-lg px-2 py-2 text-xs" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="bg-background border border-border rounded-lg px-2 py-2 text-xs">
              <option value="all">Tüm durumlar</option>
              <option value="active">Yayında</option>
              <option value="offer_collecting">Teklif topluyor</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-background border border-border rounded-lg px-2 py-2 text-xs">
              <option value="newest">En yeni</option>
              <option value="price_asc">Fiyat ↑</option>
              <option value="price_desc">Fiyat ↓</option>
              <option value="items_desc">Parça sayısı ↓</option>
            </select>
            <label className="flex items-center gap-2 text-xs col-span-2 md:col-span-2 bg-background border border-border rounded-lg px-2 py-2">
              <input type="checkbox" checked={expertOnly} onChange={(e) => setExpertOnly(e.target.checked)} />
              Sadece ekspertizli ilanlar
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">{filtered.length} ilan listeleniyor</p>
        </section>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Sonuç bulunamadı.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((l) => (
              <StokCard key={l.id} l={l} onOffered={() => qc.invalidateQueries({ queryKey: ["stok", "public", "list"] })} />
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export function StokCard({ l, onOffered }: { l: PublicStokListing; onOffered?: () => void }) {
  return (
    <article className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      <Link to="/stok/$id" params={{ id: l.id }} className="block">
        {l.cover_image ? (
          <img src={l.cover_image} alt={l.title} loading="lazy"
            className="w-full aspect-[16/10] object-cover bg-background/40" />
        ) : (
          <div className="w-full aspect-[16/10] flex items-center justify-center bg-background/40 text-muted-foreground">
            <Package className="size-8 opacity-50" />
          </div>
        )}
      </Link>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link to="/stok/$id" params={{ id: l.id }} className="min-w-0 hover:text-gold">
            <h3 className="font-semibold text-sm truncate">{l.title}</h3>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {l.city && <><MapPin className="size-3" /> {l.city} ·</>}
              {new Date(l.created_at).toLocaleDateString("tr-TR")}
            </p>
          </Link>
          {l.expected_price != null && (
            <span className="text-gold font-bold text-sm shrink-0">₺{Number(l.expected_price).toLocaleString("tr-TR")}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <BadgeRow l={l} />
        </div>

        <div className="grid grid-cols-3 gap-1 mt-auto">
          <Mini label="Parça" value={l.estimated_item_count?.toLocaleString("tr-TR") ?? "—"} />
          <Mini label="OEM" value={l.estimated_oem_count?.toLocaleString("tr-TR") ?? "—"} />
          <Mini label="Durum" value={l.status === "offer_collecting" ? "Teklif" : "Yayında"} />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
          <span className="truncate">{l.seller.company_name ?? "Taşıtsan üyesi"}</span>
          <span className="flex items-center gap-2">
            {l.image_count > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon className="size-3" />{l.image_count}</span>}
            {l.file_count > 0 && <span className="inline-flex items-center gap-0.5"><FileText className="size-3" />{l.file_count}</span>}
          </span>
        </div>

        <Link to="/stok/$id" params={{ id: l.id }}
          className="inline-flex items-center justify-center gap-1 bg-gold/90 hover:bg-gold text-background font-semibold text-xs px-3 py-1.5 rounded-lg">
          <HandCoins className="size-3.5" /> Detay & Teklif Ver
        </Link>
      </div>
    </article>
  );
}

export function BadgeRow({ l }: { l: PublicStokListing }) {
  return (
    <>
      {l.status === "offer_collecting" && (
        <Pill cls="text-sky-300 border-sky-400/40 bg-sky-400/10"><CircleDot className="size-3" /> Teklif Topluyor</Pill>
      )}
      {l.status === "active" && (
        <Pill cls="text-emerald-300 border-emerald-400/40 bg-emerald-400/10"><CircleDot className="size-3" /> Yayında</Pill>
      )}
      {l.expert_completed && (
        <Pill cls="text-emerald-300 border-emerald-400/40 bg-emerald-400/10"><ShieldCheck className="size-3" /> Taşıtsan Onaylı Stok</Pill>
      )}
      {l.expert_requested && !l.expert_completed && (
        <Pill cls="text-amber-300 border-amber-400/40 bg-amber-400/10"><CircleDot className="size-3" /> Ekspertiz Bekliyor</Pill>
      )}
      {l.seller.is_verified && (
        <Pill cls="text-gold border-gold/40 bg-gold/10"><BadgeCheck className="size-3" /> Onaylı Satıcı</Pill>
      )}
    </>
  );
}

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 border border-border/60 rounded p-1.5 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-[11px] font-bold">{value}</p>
    </div>
  );
}

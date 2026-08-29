// SEO Growth 2.0 — Ürün sayfası için zenginleştirilmiş dahili link bloku.
// Her ürün altı ~50 dahili bağlantı; SSR-friendly hidden <a> fallback dahil.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buildPartParam } from "@/lib/part-slug";
import {
  fetchSameOem, fetchSameOemFamily, fetchSameVehicle,
  fetchSameCategory, fetchSameBrand, fetchPopularRelated,
  type RelatedPartLite,
} from "@/lib/internal-links";
import { Layers, Car, Tag, Factory, Flame, Repeat } from "lucide-react";

interface Section {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  loader: (id: string, limit?: number) => Promise<RelatedPartLite[]>;
}

const SECTIONS: Section[] = [
  { key: "same_oem",        title: "Aynı OEM Kodlu Ürünler",      description: "Birebir aynı OEM numarasını taşıyan diğer ilanlar.", icon: <Repeat className="size-4 text-gold" />,  loader: fetchSameOem },
  { key: "same_family",     title: "Aynı OEM Ailesi",              description: "Revizyon ve varyant kodları (örn. -A, -B).",         icon: <Layers className="size-4 text-gold" />,  loader: fetchSameOemFamily },
  { key: "same_vehicle",    title: "Aynı Araç İçin Diğer Parçalar", description: "Aynı marka ve model uyumlu yedek parçalar.",         icon: <Car className="size-4 text-gold" />,     loader: fetchSameVehicle },
  { key: "same_category",   title: "Aynı Kategori",                description: "Aynı parça kategorisindeki diğer ilanlar.",          icon: <Tag className="size-4 text-gold" />,     loader: fetchSameCategory },
  { key: "same_brand",      title: "Aynı Üretici",                 description: "Aynı markanın diğer parça ilanları.",                icon: <Factory className="size-4 text-gold" />, loader: fetchSameBrand },
  { key: "popular",         title: "Popüler Benzer Ürünler",       description: "Son 30 günde en çok görüntülenen benzer parçalar.",  icon: <Flame className="size-4 text-gold" />,   loader: fetchPopularRelated },
];

function PartItem({ p }: { p: RelatedPartLite }) {
  const param = buildPartParam({
    id: p.id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code,
  });
  const sub = [p.brand, p.model, p.year].filter(Boolean).join(" • ");
  return (
    <li>
      <Link
        to="/parts/$id"
        params={{ id: param }}
        className="flex items-baseline justify-between gap-2 px-2 py-1.5 rounded hover:bg-background/60 transition group"
        title={p.title}
      >
        <span className="truncate text-sm">
          {p.oem_code && <span className="font-mono text-xs text-gold mr-1.5">{p.oem_code}</span>}
          <span className="group-hover:text-gold">{p.title}</span>
          {sub && <span className="text-muted-foreground text-xs ml-1">— {sub}</span>}
        </span>
        {p.price != null && (
          <span className="font-display text-xs text-gold whitespace-nowrap">
            ₺{Number(p.price).toLocaleString("tr-TR")}
          </span>
        )}
      </Link>
      <a href={`/parts/${param}`} hidden aria-hidden="true" tabIndex={-1}>{p.title}</a>
    </li>
  );
}

function SectionBlock({ section, partId }: { section: Section; partId: string }) {
  const [items, setItems] = useState<RelatedPartLite[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    section.loader(partId, 10).then((r) => { if (!cancelled) setItems(r); });
    return () => { cancelled = true; };
  }, [section, partId]);

  if (items !== null && items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-2">
      <header className="flex items-center gap-2">
        {section.icon}
        <div className="flex-1">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">{section.title}</h2>
          <p className="text-[10px] text-muted-foreground">{section.description}</p>
        </div>
      </header>
      {items === null ? (
        <div className="text-xs text-muted-foreground py-2">Yükleniyor…</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {items.map((p) => <PartItem key={p.id} p={p} />)}
        </ul>
      )}
    </section>
  );
}

export function PartInternalLinks({ partId }: { partId: string }) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => (
        <SectionBlock key={s.key} section={s} partId={partId} />
      ))}
    </div>
  );
}

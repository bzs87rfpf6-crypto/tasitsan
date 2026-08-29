// SSR-rendered internal-linking blocks for SEO.
// Pure server-rendered <a>/Link list with no client state — visible to crawlers
// even when JS is disabled. Keep markup semantic (h2 + ul/li) for indexability.
import { Link } from "@tanstack/react-router";
import { buildPartParam } from "@/lib/part-slug";
import type { HomeSeoBlocks, SeoBlockPart } from "@/lib/seo-blocks.functions";

function partHref(p: SeoBlockPart) {
  return `/parts/${buildPartParam({ id: p.id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code })}`;
}

function PartList({ items, ariaLabel }: { items: SeoBlockPart[]; ariaLabel: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Şu anda listelenen ürün yok.</p>;
  }
  return (
    <ul aria-label={ariaLabel} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {items.map((p) => {
        const title = [p.oem_code, p.title].filter(Boolean).join(" · ");
        const sub = [p.brand, p.model, p.city].filter(Boolean).join(" • ");
        return (
          <li key={p.id}>
            <Link
              to="/parts/$id"
              params={{ id: buildPartParam({ id: p.id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code }) }}
              className="block rounded-lg border border-border bg-background/40 px-3 py-2 hover:border-gold/60 hover:bg-gold/5 transition"
              title={p.title}
            >
              <span className="block text-xs font-semibold text-foreground line-clamp-1">{title}</span>
              {sub && <span className="block text-[10px] text-muted-foreground line-clamp-1">{sub}</span>}
            </Link>
            {/* SSR-safe absolute href fallback for crawlers; hidden, harmless dup link */}
            <a href={partHref(p)} hidden aria-hidden="true" tabIndex={-1}>
              {p.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <header className="space-y-0.5">
        <h2 className="font-display text-base sm:text-lg tracking-wide text-gold">{title}</h2>
        <p className="text-[11px] sm:text-xs text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function SeoInterlinks({ blocks }: { blocks: HomeSeoBlocks | null }) {
  if (!blocks) return null;
  const hasAny =
    blocks.popularOems.length +
      blocks.toyotaHilux.length +
      blocks.mitsubishiL200.length +
      blocks.construction.length +
      blocks.recent.length >
    0;
  if (!hasAny) return null;

  return (
    <div className="max-w-5xl xl:max-w-7xl mx-auto px-3 sm:px-5 pt-8 space-y-4">
      <div className="text-center space-y-1 pb-1">
        <h2 className="font-display text-xl sm:text-2xl tracking-wide">Taşıtsan'da Öne Çıkanlar</h2>
        <p className="text-xs text-muted-foreground">
          Popüler OEM kodları, marka-modele göre yedek parçalar ve son eklenen ilanlar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {blocks.popularOems.length > 0 && (
          <Block
            title="Popüler OEM Kodları"
            description="Son 30 günde en çok aratılan OEM numaraları — tıklayarak Taşıtsan'da ara."
          >
            <ul aria-label="Popüler OEM kodları" className="flex flex-wrap gap-1.5">
              {blocks.popularOems.map((o) => (
                <li key={o.oem}>
                  <a
                    href={`/?oem=${encodeURIComponent(o.oem)}`}
                    className="inline-block font-mono text-xs px-2.5 py-1 rounded-md bg-background border border-gold/30 text-gold hover:bg-gold/10 transition"
                    title={`${o.oem} OEM numaralı yedek parça`}
                  >
                    {o.oem}
                  </a>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block
          title="Toyota Hilux Yedek Parçaları"
          description="Toyota Hilux için en güncel ilanlar."
        >
          <PartList items={blocks.toyotaHilux} ariaLabel="Toyota Hilux parçaları" />
        </Block>

        <Block
          title="Mitsubishi L200 Yedek Parçaları"
          description="Mitsubishi L200 için son eklenen ilanlar."
        >
          <PartList items={blocks.mitsubishiL200} ariaLabel="Mitsubishi L200 parçaları" />
        </Block>

        <Block
          title="İş Makinesi Parçaları"
          description="Ekskavatör, yükleyici ve diğer iş makinesi yedek parçaları."
        >
          <PartList items={blocks.construction} ariaLabel="İş makinesi parçaları" />
        </Block>

        <Block
          title="Son Eklenen Ürünler"
          description="Taşıtsan Parça Borsası'na son eklenen tüm ilanlar."
        >
          <PartList items={blocks.recent} ariaLabel="Son eklenen ürünler" />
        </Block>
      </div>
    </div>
  );
}

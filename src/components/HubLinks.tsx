// SEO Faz 7 — Ürün sayfasından ilgili hub sayfalarına doğal iç linkler.
// PartInternalLinks (aynı OEM, model, kategori vb. ilanlar) ile birlikte kullanılır;
// bu bileşen ise ürünü çevreleyen OEM / marka / kategori "hub" landing sayfalarına
// bağlantı verir. Amaç: topic cluster'ın merkezine akış (link equity).
import { Link } from "@tanstack/react-router";
import { slugifyOem } from "@/lib/part-slug";
import { Compass } from "lucide-react";

interface HubLinksProps {
  brand: string | null;
  model: string | null;
  category: string | null;
  oemCodes: string[];
}

function slugifyKategori(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyBrand(value: string): string {
  return slugifyKategori(value);
}

export function HubLinks({ brand, model, category, oemCodes }: HubLinksProps) {
  const items: Array<{ label: string; to: string; params: Record<string, string> }> = [];

  const uniqueOems = Array.from(new Set(oemCodes.filter(Boolean))).slice(0, 3);
  for (const oem of uniqueOems) {
    items.push({
      label: `${oem} OEM Rehberi`,
      to: "/oem/$oem",
      params: { oem: slugifyOem(oem) },
    });
  }

  if (brand) {
    items.push({
      label: `${brand} Yedek Parça`,
      to: "/marka/$brand",
      params: { brand: slugifyBrand(brand) },
    });
  }

  if (category) {
    items.push({
      label: `${category} Kategorisi`,
      to: "/kategori/$slug",
      params: { slug: slugifyKategori(category) },
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center gap-2">
        <Compass className="size-4 text-gold" />
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">İlgili Rehberler</h2>
          <p className="text-[10px] text-muted-foreground">Bu parça ile ilgili OEM, marka ve kategori sayfaları.</p>
        </div>
      </header>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={`${item.to}-${JSON.stringify(item.params)}`}>
            <Link
              to={item.to}
              // TanStack Router typed params kabul eder; params tipini pas geçmek için as unknown
              params={item.params as never}
              className="inline-flex items-center px-3 py-1.5 rounded-full border border-border bg-background/60 text-xs hover:text-gold hover:border-gold transition"
              title={item.label}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

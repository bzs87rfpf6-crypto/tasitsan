import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Truck, Search } from "lucide-react";
import { HEAVY_VEHICLE_BRANDS, HEAVY_VEHICLE_CATEGORIES } from "@/lib/heavy-vehicle";

const PAGE_URL = "https://www.tasitsan.com.tr/agir-vasita-parcalari";
const PAGE_TITLE = "Ağır Vasıta Yedek Parçaları — Kamyon, TIR, Otobüs | Taşıtsan";
const PAGE_DESC =
  "Mercedes-Benz Trucks, MAN, Scania, Volvo, DAF, Iveco ve daha fazlası için ağır vasıta yedek parçaları. OEM kodu, parça adı, araç modeli veya marka ile arayın.";

export const Route = createFileRoute("/agir-vasita-parcalari")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESC },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Ağır Vasıta Yedek Parçaları",
          description: PAGE_DESC,
          url: PAGE_URL,
          isPartOf: {
            "@type": "WebSite",
            name: "Taşıtsan Parça Borsası",
            url: "https://www.tasitsan.com.tr",
          },
        }),
      },
    ],
  }),
  component: HeavyVehicleLandingPage,
});

function HeavyVehicleLandingPage() {
  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 pt-6 lg:pt-10 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/10 border border-gold/40 text-gold text-xs font-bold">
            <Truck className="size-4" /> Ağır Vasıta
          </div>
          <h1 className="font-display text-3xl lg:text-4xl tracking-wide">
            Ağır Vasıta Yedek Parçaları
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
            Kamyon, TIR, çekici ve otobüsler için orijinal ve eşdeğer yedek parçalar.
            OEM kodu, parça adı, araç modeli veya marka ile aratıp hemen teklif alın.
          </p>
          <Link
            to="/parts"
            search={{ q: "", brand: "", oem: "", vc: "heavy_vehicle", page: 1 }}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-gold-gradient text-gold-foreground font-bold shadow-gold"
          >
            <Search className="size-4" /> Ağır Vasıta Parçası Ara
          </Link>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-xl tracking-wide">Markalar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {HEAVY_VEHICLE_BRANDS.map((b) => (
              <Link
                key={b}
                to="/parts"
                search={{ q: "", brand: b, oem: "", vc: "heavy_vehicle", page: 1 }}
                className="px-4 py-3 rounded-xl bg-card border border-border hover:border-gold/60 text-sm font-semibold transition"
              >
                {b}
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl tracking-wide">Kategoriler</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {HEAVY_VEHICLE_CATEGORIES.map((c) => (
              <Link
                key={c}
                to="/parts"
                search={{ q: c, brand: "", oem: "", vc: "heavy_vehicle", page: 1 }}
                className="px-4 py-3 rounded-xl bg-card border border-border hover:border-gold/60 text-sm font-semibold transition"
              >
                {c}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

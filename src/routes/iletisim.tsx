import { createFileRoute } from "@tanstack/react-router";
import { COMPANY, organizationLd } from "@/lib/eeat-content";
import { Mail, Phone, MapPin, Clock } from "lucide-react";

const TITLE = "İletişim — Taşıtsan Parça Borsası";
const DESC = "Taşıtsan ile iletişime geçin: telefon, e-posta, adres, çalışma saatleri ve sosyal medya hesapları.";

export const Route = createFileRoute("/iletisim")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${COMPANY.url}/iletisim` },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${COMPANY.url}/iletisim` }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(organizationLd()) },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: TITLE,
          description: DESC,
          url: `${COMPANY.url}/iletisim`,
          mainEntity: {
            "@type": "Organization",
            name: COMPANY.legalName,
            email: COMPANY.email,
            telephone: COMPANY.phone,
            contactPoint: [{
              "@type": "ContactPoint",
              telephone: COMPANY.phone,
              email: COMPANY.email,
              contactType: "customer support",
              areaServed: "TR",
              availableLanguage: ["tr", "en"],
            }],
          },
        }),
      },
    ],
  }),
  component: IletisimPage,
});

function IletisimPage() {
  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-4 pt-6 lg:pt-10 space-y-6">
        <header className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-gold">Bize Ulaşın</div>
          <h1 className="font-display text-3xl tracking-wide">İletişim</h1>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card icon={<Mail className="size-4 text-gold" />} label="E-posta"
            value={COMPANY.email} href={`mailto:${COMPANY.email}`} />
          <Card icon={<Phone className="size-4 text-gold" />} label="Telefon"
            value={COMPANY.phone} href={`tel:${COMPANY.phone}`} />
          <Card icon={<MapPin className="size-4 text-gold" />} label="Adres"
            value={`${COMPANY.address.streetAddress}, ${COMPANY.address.addressLocality}`} />
          <Card icon={<Clock className="size-4 text-gold" />} label="Çalışma Saatleri"
            value="Hafta içi 09:00-18:00 • Cumartesi 10:00-15:00" />
        </div>

        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="font-display text-lg">Sosyal Medya</h2>
          <ul className="text-sm space-y-1">
            {COMPANY.sameAs.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-gold underline break-all">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Card({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const inner = (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}{label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

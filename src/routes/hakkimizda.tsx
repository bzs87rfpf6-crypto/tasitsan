import { createFileRoute, Link } from "@tanstack/react-router";
import { COMPANY, organizationLd } from "@/lib/eeat-content";
import { ShieldCheck, Award, Users, Search } from "lucide-react";

const TITLE = "Hakkımızda — Taşıtsan Parça Borsası";
const DESC =
  "Taşıtsan, Türkiye'nin doğrulanmış otomotiv yedek parça borsasıdır. OEM eşleştirme, satıcı doğrulama ve güvenli mesajlaşma altyapısıyla alıcıyı satıcıyla buluşturur.";

export const Route = createFileRoute("/hakkimizda")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${COMPANY.url}/hakkimizda` },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { name: "robots", content: "index,follow,max-image-preview:large" },
    ],
    links: [{ rel: "canonical", href: `${COMPANY.url}/hakkimizda` }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(organizationLd()) },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: TITLE,
          description: DESC,
          url: `${COMPANY.url}/hakkimizda`,
        }),
      },
    ],
  }),
  component: HakkimizdaPage,
});

function HakkimizdaPage() {
  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-4 pt-6 lg:pt-10 space-y-8">
        <header className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold">Kurumsal</div>
          <h1 className="font-display text-3xl tracking-wide">Taşıtsan Parça Borsası</h1>
          <p className="text-sm text-muted-foreground">
            Türkiye'nin doğrulanmış otomotiv yedek parça borsası.
          </p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            <strong>Taşıtsan</strong>, ağır vasıta, otomobil ve iş makinesi yedek parça
            tedarikinde alıcı ile doğrulanmış satıcıyı buluşturan dijital bir borsa olarak
            {" "}{COMPANY.foundedYear} yılında kurulmuştur. Platformumuz, OEM eşleştirme
            algoritması, satıcı kimlik doğrulama ve güvenli mesajlaşma altyapısı ile
            klasik aftermarket pazaryerlerinden ayrışır.
          </p>
          <p>
            Veritabanımızda <strong>14.000+ aktif ilan</strong>, kapsamlı OEM çapraz
            referans tablosu ve marka-model-motor kodu seviyesinde uyumluluk verisi yer
            alır. Kullanıcılar OEM numarası, marka, model ya da motor koduyla arama
            yapabilir; sistem doğrulanmış satıcı ilanlarını öncelikli olarak gösterir.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Feature icon={<ShieldCheck className="size-5 text-gold" />} title="Doğrulanmış Satıcılar"
            text="Tüm satıcılar kimlik, vergi numarası ve iletişim doğrulamasından geçer." />
          <Feature icon={<Search className="size-5 text-gold" />} title="OEM Eşleştirme"
            text="Otomatik normalizasyon, eşdeğer ve aile (revizyon) eşleştirmesi." />
          <Feature icon={<Award className="size-5 text-gold" />} title="Uzmanlık"
            text="Otomotiv tedarik zincirinde 20+ yıllık sektör tecrübesi." />
          <Feature icon={<Users className="size-5 text-gold" />} title="Topluluk"
            text="Binlerce profesyonel alıcı ve OEM tedarikçi ağı." />
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl">Uzmanlık Alanlarımız</h2>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            {COMPANY.expertise.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </section>

        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="font-display text-lg">İletişim</h2>
          <p className="text-sm text-muted-foreground">
            E-posta: <a href={`mailto:${COMPANY.email}`} className="text-gold">{COMPANY.email}</a>
            <br/>Telefon: <a href={`tel:${COMPANY.phone}`} className="text-gold">{COMPANY.phone}</a>
            <br/>{COMPANY.address.streetAddress}, {COMPANY.address.addressLocality} {COMPANY.address.postalCode}
          </p>
          <Link to="/iletisim" className="inline-block text-xs text-gold underline">Tüm iletişim seçenekleri →</Link>
        </section>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="font-semibold text-sm">{title}</span></div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

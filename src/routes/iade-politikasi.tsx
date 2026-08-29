import { createFileRoute, Link } from "@tanstack/react-router";
import { COMPANY } from "@/lib/eeat-content";

const TITLE = "Taşıtsan | İade ve İptal Politikası";
const DESC =
  "Taşıtsan İade ve İptal Politikası. Sipariş iptali, ürün iadesi, değişim şartları ve satıcı sorumlulukları hakkında bilgi alın.";
const URL = `${COMPANY.url}/iade-politikasi`;
const UPDATED = "03.08.2026";

export const Route = createFileRoute("/iade-politikasi")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "index,follow,max-image-preview:large,max-snippet:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "İade ve İptal Politikası",
          headline: "İade ve İptal Politikası",
          description: DESC,
          url: URL,
          inLanguage: "tr-TR",
          dateModified: "2026-08-03",
          isPartOf: { "@type": "WebSite", name: COMPANY.legalName, url: COMPANY.url },
          publisher: { "@id": `${COMPANY.url}/#organization` },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Anasayfa", item: COMPANY.url },
            { "@type": "ListItem", position: 2, name: "İade ve İptal Politikası", item: URL },
          ],
        }),
      },
    ],
  }),
  component: IadePolitikasiPage,
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-3">
      <h2 className="font-display text-lg sm:text-xl text-gold">{title}</h2>
      <div className="text-sm leading-relaxed text-foreground/90 space-y-2">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-outside pl-5 space-y-1 text-muted-foreground">
      {items.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
}

function IadePolitikasiPage() {
  return (
    <div className="min-h-screen pb-24">
      <div className="mx-auto w-full max-w-[900px] px-4 pt-6 lg:pt-10 space-y-6">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link to="/" className="hover:text-gold">Anasayfa</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="text-foreground">İade ve İptal Politikası</li>
          </ol>
        </nav>

        <header className="space-y-2">
          <h1 className="font-display text-2xl sm:text-3xl tracking-wide text-gold">
            İade ve İptal Politikası
          </h1>
          <p className="text-xs text-muted-foreground">Son Güncelleme: {UPDATED}</p>
          <p className="text-sm leading-relaxed text-foreground/90">
            Taşıtsan.com.tr, alıcılar ile yedek parça satıcılarını buluşturan bir pazar yeri
            platformudur. Platform üzerinden gerçekleştirilen satışlarda ürünlerin satıcısı
            ilgili satıcıdır. Bu nedenle iade ve iptal süreçleri aşağıdaki esaslara göre
            yürütülmektedir.
          </p>
        </header>

        <Card title="1. Sipariş İptali">
          <List items={[
            "Sipariş satıcı tarafından kargoya verilmeden önce iptal edilebilir.",
            "Kargoya verilmiş siparişlerde iade süreci uygulanır.",
          ]} />
        </Card>

        <Card title="2. İade Şartları">
          <p>Aşağıdaki durumlarda iade talebi oluşturulabilir:</p>
          <List items={[
            "Yanlış ürün gönderilmesi",
            "Kusurlu veya hasarlı ürün gönderilmesi",
            "Eksik ürün teslim edilmesi",
            "Ürünün ilandaki açıklamaya uygun olmaması",
            "OEM numarasının veya teknik bilgilerin hatalı belirtilmesi",
          ]} />
          <p>İade taleplerinde mümkün olduğunca fotoğraf ve açıklama eklenmesi tavsiye edilir.</p>
        </Card>

        <Card title="3. İade Kabul Edilmeyen Durumlar">
          <p>Aşağıdaki durumlarda satıcı iade talebini reddedebilir:</p>
          <List items={[
            "Kullanılmış ürünler",
            "Montajı yapılmış ürünler",
            "Yanlış montaj nedeniyle zarar gören ürünler",
            "Alıcının yanlış OEM veya yanlış parça sipariş etmesi",
            "Satıcı açıklamasında belirtilen özel durumlar",
          ]} />
        </Card>

        <Card title="4. Kargo Hasarı">
          <p>Ürün teslim alınırken kontrol edilmelidir.</p>
          <p>
            Kargo kaynaklı hasarlarda mümkünse teslim sırasında tutanak tutulmalı ve satıcıya
            en kısa sürede bildirim yapılmalıdır.
          </p>
        </Card>

        <Card title="5. Satıcıların Sorumluluğu">
          <p>Taşıtsan'da satış yapan satıcılar;</p>
          <List items={[
            "Ürün bilgilerinin doğruluğundan,",
            "OEM bilgilerinin doğruluğundan,",
            "Ürünün açıklamaya uygun olmasından,",
            "Yürürlükteki tüketici mevzuatına uygun hareket etmekten sorumludur.",
          ]} />
        </Card>

        <Card title="6. Taşıtsan'ın Rolü">
          <p>Taşıtsan yalnızca alıcı ve satıcıyı buluşturan bir pazaryeri platformudur.</p>
          <p>Taşıtsan ürünlerin satıcısı değildir.</p>
          <p>İade süreçleri ilgili satıcı tarafından yürütülür.</p>
          <p>
            Gerekli durumlarda Taşıtsan taraflar arasındaki iletişimi kolaylaştırır ve çözüm
            sürecine destek sağlayabilir.
          </p>
        </Card>

        <Card title="7. Değişim Politikası">
          <p>Satıcı uygun görmesi halinde ürün değişimi yapabilir.</p>
          <p>Değişim şartları ilgili satıcı tarafından belirlenmektedir.</p>
        </Card>

        <Card title="8. Uyuşmazlıklar">
          <p>
            Çözülemeyen uyuşmazlıklarda taraflar yürürlükteki tüketici mevzuatı kapsamında
            Tüketici Hakem Heyeti veya yetkili mahkemelere başvurabilir.
          </p>
        </Card>

        <Card title="9. İletişim">
          <p>
            İade veya değişim talepleriniz için hesabınızdaki{" "}
            <Link to="/account/orders" className="text-gold hover:underline">sipariş ekranını</Link>{" "}
            kullanabilir veya{" "}
            <Link to="/iletisim" className="text-gold hover:underline">İletişim</Link>{" "}
            sayfamız üzerinden bizimle iletişime geçebilirsiniz.
          </p>
        </Card>
      </div>
    </div>
  );
}

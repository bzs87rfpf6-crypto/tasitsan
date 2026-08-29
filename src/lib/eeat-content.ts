// Sabit firma profili — E-E-A-T / LocalBusiness / Organization şemaları için
// tek kaynak. Tüm SEO sayfaları (root, hakkımızda, iletişim) buradan beslenir.

export const COMPANY = {
  legalName: "Taşıtsan Parça Borsası",
  brand: "Taşıtsan",
  url: "https://www.tasitsan.com.tr",
  logo: "https://www.tasitsan.com.tr/icon-512.png",
  email: "destek@tasitsan.com.tr",
  phone: "+90-850-241-2300",
  foundedYear: 2024,
  description:
    "Taşıtsan, Türkiye'nin doğrulanmış otomotiv yedek parça borsasıdır. OEM eşleştirme, satıcı doğrulama ve güvenli mesajlaşma ile ağır vasıta, otomobil ve iş makinesi parçalarını alıcı ve satıcı arasında buluşturur.",
  address: {
    streetAddress: "Ataşehir Bulvarı, İş Kuleleri",
    addressLocality: "İstanbul",
    addressRegion: "İstanbul",
    postalCode: "34750",
    addressCountry: "TR",
  },
  geo: { latitude: 40.9923, longitude: 29.1244 },
  openingHours: ["Mo-Fr 09:00-18:00", "Sa 10:00-15:00"],
  sameAs: [
    "https://www.linkedin.com/company/tasitsan",
    "https://www.instagram.com/tasitsan",
    "https://www.facebook.com/tasitsan",
    "https://twitter.com/tasitsan",
    "https://www.youtube.com/@tasitsan",
  ],
  expertise: [
    "OEM numarası eşleştirme",
    "Ağır vasıta yedek parça borsası",
    "Otomotiv aftermarket envanteri",
    "İş makinesi yedek parça temini",
    "Satıcı doğrulama ve güvenli mesajlaşma",
  ],
} as const;

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness", "AutoPartsStore"],
    "@id": `${COMPANY.url}/#organization`,
    name: COMPANY.legalName,
    alternateName: COMPANY.brand,
    url: COMPANY.url,
    logo: COMPANY.logo,
    image: COMPANY.logo,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    foundingDate: `${COMPANY.foundedYear}-01-01`,
    description: COMPANY.description,
    address: { "@type": "PostalAddress", ...COMPANY.address },
    geo: { "@type": "GeoCoordinates", ...COMPANY.geo },
    openingHoursSpecification: COMPANY.openingHours.map((spec) => {
      const [days, hours] = spec.split(" ");
      const [opens, closes] = (hours ?? "").split("-");
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: expandDays(days),
        opens,
        closes,
      };
    }),
    sameAs: [...COMPANY.sameAs],
    areaServed: { "@type": "Country", name: "Türkiye" },
    knowsAbout: [...COMPANY.expertise],
    potentialAction: {
      "@type": "SearchAction",
      target: `${COMPANY.url}/parts?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

const DAY_MAP: Record<string, string> = {
  Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday",
  Fr: "Friday", Sa: "Saturday", Su: "Sunday",
};

function expandDays(token: string): string[] {
  if (token.includes("-")) {
    const [start, end] = token.split("-");
    const order = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const i = order.indexOf(start);
    const j = order.indexOf(end);
    if (i < 0 || j < 0) return [];
    return order.slice(i, j + 1).map((d) => DAY_MAP[d]).filter(Boolean);
  }
  return [DAY_MAP[token]].filter(Boolean);
}

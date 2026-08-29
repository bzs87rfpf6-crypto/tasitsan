// OEM görselleri için SEO alt/title metni + JSON-LD ImageObject üreticileri.
// Örnek alt: "Toyota Hilux 89465-0K010 Rail Müşürü OEM Parça"

export interface OemSeoMeta {
  brand?: string | null;
  model?: string | null;
  oem?: string | null;
  title?: string | null;
}

export function buildOemImageAlt(m: OemSeoMeta): string {
  const parts: string[] = [];
  if (m.brand) parts.push(m.brand);
  if (m.model) parts.push(m.model);
  if (m.oem) parts.push(m.oem);
  if (m.title) parts.push(m.title);
  parts.push("OEM Parça");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function buildOemImageTitle(m: OemSeoMeta): string {
  return buildOemImageAlt(m);
}

export function buildImageObjectJsonLd(url: string, m: OemSeoMeta) {
  const name = buildOemImageAlt(m);
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: url,
    url,
    name,
    description: name,
    representativeOfPage: true,
  };
}

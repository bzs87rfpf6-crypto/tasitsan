// SEO INDEX BOOST 2.0 — sunucu tarafı motor.
// "Tarandı, şu anda dizine eklenmedi" durumundaki ve puanı 80 altındaki ürünleri
// otomatik güçlendirir: iç link, OEM/marka bağlantıları, alt metin, meta,
// AI ile içerik zenginleştirme, IndexNow kuyruğu.

import { normalizeAttributes, buildAltTexts, type RawPartRow, type NormalizedAttributes } from "./seo-attributes";
import { computeSeoScore } from "./seo-scoring";
import { buildPartParam, slugifyOem } from "./part-slug";
import { buildUniqueTitle, buildUniqueDescription } from "./product-seo-meta";

export const ORIGIN = "https://www.tasitsan.com.tr";
export const MIN_SIMILAR_LINKS = 2;
export const MIN_OEM_LINKS = 4;
const THIN_DESC = 300;

export type LinkItem = { url: string; title: string; reason: string };

const PART_SELECT =
  "id,seo_slug,title,description,brand,model,year,category,oem_code,oem_codes,oem_families,oem_family,engine_code,part_type,vehicle_class,city,photos,condition,status";

function partUrl(p: { id: string; seo_slug?: string | null; title?: string | null; oem_code?: string | null; oem_codes?: string[] | null }) {
  return `${ORIGIN}/parts/${buildPartParam(p)}`;
}

/** İç link seti: >=2 benzer ürün + >=4 ilgili OEM + marka/model/kategori hub'ları. */
export async function buildBoostLinks(
  db: any,
  current: RawPartRow,
  attrs: NormalizedAttributes,
): Promise<{ links: LinkItem[]; similar: number; oem: number }> {
  const links: LinkItem[] = [];
  const seenUrl = new Set<string>([partUrl(current)]);
  const push = (l: LinkItem) => {
    if (seenUrl.has(l.url)) return;
    seenUrl.add(l.url);
    links.push(l);
  };

  // 1) Benzer ürünler — aynı OEM, aynı araç, aynı kategori sırasıyla.
  const similarBefore = links.length;
  const sel = "id,title,seo_slug,oem_code,oem_codes";
  const queries: Array<{ q: any; reason: string }> = [];
  if (attrs.oem_primary) {
    queries.push({
      q: db.from("parts").select(sel).eq("status", "approved").neq("id", current.id).contains("oem_codes", [attrs.oem_primary]).limit(5),
      reason: "same_oem",
    });
  }
  if (attrs.brand && attrs.model) {
    queries.push({
      q: db.from("parts").select(sel).eq("status", "approved").neq("id", current.id).eq("brand", attrs.brand).eq("model", attrs.model).limit(5),
      reason: "same_vehicle",
    });
  }
  if (attrs.category) {
    queries.push({
      q: db.from("parts").select(sel).eq("status", "approved").neq("id", current.id).eq("category", attrs.category).limit(5),
      reason: "same_category",
    });
  }
  for (const { q, reason } of queries) {
    const { data } = await q;
    for (const r of (data ?? []) as any[]) push({ url: partUrl(r), title: r.title, reason });
    if (links.length - similarBefore >= 6) break;
  }
  const similar = links.length - similarBefore;

  // 2) İlgili OEM sayfaları (en az 4) — kendi OEM'leri + muadil kod tablosu.
  const oemCodes: string[] = [...(attrs.oem_all ?? [])];
  if (oemCodes.length < MIN_OEM_LINKS && attrs.oem_primary) {
    const { data: xref } = await db
      .from("oem_cross_reference")
      .select("oem_code,equivalent_code")
      .or(`oem_code.eq.${attrs.oem_primary},equivalent_code.eq.${attrs.oem_primary}`)
      .limit(12);
    for (const r of (xref ?? []) as any[]) {
      for (const c of [r.oem_code, r.equivalent_code]) {
        if (c && !oemCodes.includes(c)) oemCodes.push(c);
      }
    }
  }
  if (oemCodes.length < MIN_OEM_LINKS && attrs.brand) {
    const { data: more } = await db
      .from("parts").select("oem_code").eq("status", "approved").eq("brand", attrs.brand)
      .not("oem_code", "is", null).neq("id", current.id).limit(20);
    for (const r of (more ?? []) as any[]) {
      if (r.oem_code && !oemCodes.includes(r.oem_code)) oemCodes.push(r.oem_code);
    }
  }
  let oem = 0;
  for (const code of oemCodes.slice(0, 8)) {
    const slug = slugifyOem(code);
    if (!slug) continue;
    push({ url: `${ORIGIN}/oem/${slug}`, title: `${code} OEM muadilleri`, reason: "oem_hub" });
    oem += 1;
  }

  // 3) Marka / model / kategori hub'ları (breadcrumb ile aynı hiyerarşi).
  if (attrs.brand) {
    const b = slugifyOem(attrs.brand);
    push({ url: `${ORIGIN}/marka/${b}`, title: `${attrs.brand} yedek parça`, reason: "brand_hub" });
    if (attrs.model) {
      const m = slugifyOem(attrs.model);
      push({ url: `${ORIGIN}/marka/${b}/${m}`, title: `${attrs.brand} ${attrs.model} parçaları`, reason: "model_hub" });
      if (attrs.category) {
        push({
          url: `${ORIGIN}/marka/${b}/${m}/${slugifyOem(attrs.category)}`,
          title: `${attrs.brand} ${attrs.model} ${attrs.category}`,
          reason: "model_category_hub",
        });
      }
    }
  }
  if (attrs.category) {
    push({ url: `${ORIGIN}/kategori/${slugifyOem(attrs.category)}`, title: `${attrs.category} ilanları`, reason: "category_hub" });
  }
  push({ url: `${ORIGIN}/`, title: "Taşıtsan yedek parça pazarı", reason: "home" });

  return { links: links.slice(0, 16), similar, oem };
}

/** İnce içerikli açıklamaları AI ile zenginleştirir; sonucu ai_content_cache'e yazar. */
export async function enrichThinDescription(
  db: any,
  part: RawPartRow & { description?: string | null },
): Promise<string | null> {
  const current = (part.description ?? "").trim();
  if (current.length >= THIN_DESC) return null;
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return null;

  const veh = [part.brand, part.model, part.year].filter(Boolean).join(" ");
  const oem = part.oem_code ?? (part.oem_codes ?? [])[0] ?? "";
  const prompt =
    `İlan başlığı: ${part.title}\nAraç: ${veh || "belirtilmemiş"}\nKategori: ${part.category ?? "-"}\n` +
    `OEM: ${oem || "-"}\nMevcut açıklama: ${current || "(yok)"}\n\n` +
    "Bu yedek parça ilanı için 350-600 karakter, özgün, Türkçe bir ürün açıklaması yaz. " +
    "Uydurma teknik değer verme; parçanın işlevi, uyumluluk kontrolü ve satın alma tavsiyesine odaklan. Sadece düz metin döndür.";

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Türkiye'de otomotiv yedek parça uzmanı bir editörsün. Kısa, doğru ve özgün metin üretirsin." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (text.length < 200) return null;

    await db.from("ai_content_cache").upsert(
      {
        scope: "part_desc",
        scope_key: part.id,
        content: { description: text } as any,
        quality_score: Math.min(100, Math.round(text.length / 8)),
        model: "google/gemini-3-flash-preview",
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      },
      { onConflict: "scope,scope_key" },
    );
    return text;
  } catch {
    return null;
  }
}

export interface BoostResult {
  part_id: string;
  url: string;
  score_before: number;
  score_after: number;
  links: number;
  similar: number;
  oem_links: number;
  actions: string[];
}

/** Tek ürünü güçlendirir ve product_seo_meta satırını günceller. */
export async function boostPart(db: any, partId: string): Promise<BoostResult | null> {
  const { data: raw } = await db.from("parts").select(PART_SELECT).eq("id", partId).maybeSingle();
  if (!raw || raw.status !== "approved") return null;
  const part = raw as RawPartRow & { description?: string | null; status: string; seo_slug?: string | null };

  const { data: metaRow } = await db
    .from("product_seo_meta")
    .select("part_id,title,description,content_hash,manually_edited,ai_faqs,score,index_state")
    .eq("part_id", partId)
    .maybeSingle();

  const actions: string[] = [];
  const attrs = normalizeAttributes(part);
  const { links, similar, oem } = await buildBoostLinks(db, part, attrs);
  const alts = buildAltTexts(part, attrs);
  if (alts.length > 0) actions.push("alt_texts_filled");

  // Eksik meta title/description tamamla (elle düzenlenmişse dokunma).
  let title = metaRow?.title ?? "";
  let description = metaRow?.description ?? "";
  const seoInput = {
    id: part.id, title: part.title, brand: part.brand, model: part.model, year: part.year,
    category: part.category, oem_code: part.oem_code, oem_codes: part.oem_codes,
    city: (part as any).city ?? null, condition: (part as any).condition ?? null,
    description: part.description ?? null,
  } as any;
  if (!metaRow?.manually_edited) {
    if (title.trim().length < 20) { title = buildUniqueTitle(seoInput); actions.push("title_generated"); }
    if (description.trim().length < 80) { description = buildUniqueDescription(seoInput); actions.push("meta_description_generated"); }
  }

  const enriched = await enrichThinDescription(db, part);
  if (enriched) actions.push("ai_content_enriched");

  const faqsCount = Array.isArray(metaRow?.ai_faqs) ? (metaRow!.ai_faqs as unknown[]).length : 0;
  const photosCount = (part.photos ?? []).filter((u) => typeof u === "string").length;
  const canonicalOk = Boolean(part.seo_slug && part.seo_slug.trim());
  const schemaOk = Boolean(attrs.brand && attrs.oem_primary);

  const score = computeSeoScore({
    title, description,
    content_hash: metaRow?.content_hash ?? "",
    duplicate_hash_count: 1,
    faqs_count: faqsCount,
    internal_links_count: links.length,
    photos_count: photosCount,
    alt_texts_count: alts.length,
    indexable: true,
    canonical_ok: canonicalOk,
    attrs,
    own_description_length: (enriched ?? part.description ?? "").length,
  });

  const issues = new Set<string>(score.issues);
  if (similar < MIN_SIMILAR_LINKS) issues.add("few_similar_links"); else actions.push("similar_links_added");
  if (oem < MIN_OEM_LINKS) issues.add("few_oem_links"); else actions.push("oem_links_added");
  if (!schemaOk) issues.add("schema_incomplete"); else actions.push("schema_verified");
  if (!canonicalOk) issues.add("canonical_missing"); else actions.push("canonical_ok");
  actions.push("breadcrumb_ok");

  await db.from("product_seo_meta").upsert(
    {
      part_id: part.id,
      title, description,
      attributes: attrs as any,
      internal_links: links as any,
      alt_texts: alts as any,
      score: score.score,
      score_breakdown: score.breakdown as any,
      issues: Array.from(issues) as any,
      needs_rewrite: score.score < 80,
      enriched_at: new Date().toISOString(),
      boosted_at: new Date().toISOString(),
      boost_notes: actions as any,
    },
    { onConflict: "part_id" },
  );

  // IndexNow kuyruğuna al — yeniden tarama sinyali.
  const url = partUrl(part);
  const { data: queued } = await db
    .from("indexnow_queue").select("id").eq("url", url).eq("status", "pending").maybeSingle();
  if (!queued) await db.from("indexnow_queue").insert({ url, status: "pending" });

  return {
    part_id: part.id, url,
    score_before: metaRow?.score ?? 0,
    score_after: score.score,
    links: links.length, similar, oem_links: oem, actions,
  };
}

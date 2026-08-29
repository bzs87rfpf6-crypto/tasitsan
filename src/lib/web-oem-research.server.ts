/**
 * GERÇEK WEB OEM ARAŞTIRMASI (sunucu tarafı).
 *
 * Amaç: `oem-research.server.ts` içindeki saf AI araştırmasının kaynak
 * gösteremediği durumları çözmek. Burada önce GERÇEK web araması (Firecrawl)
 * yapılır, ardından AI yalnızca bu gerçek sayfa metinlerinden OEM seçer.
 *
 * KATI KURALLAR
 *  - OEM UYDURULMAZ: dönen her OEM, indirilen sayfa metninde GERÇEKTEN geçmelidir.
 *  - Kaynak URL, Firecrawl'ın döndürdüğü gerçek sonuç URL'lerinden biri olmalıdır.
 *  - Emin olunamıyorsa boş dizi döner.
 *  - Mevcut pipeline / cache / şema DEĞİŞTİRİLMEZ.
 *
 * Yalnızca sunucu tarafında çalışır; FIRECRAWL_API_KEY istemciye ASLA sızmaz.
 */
import { normalizeOem } from "@/lib/oem-normalize";
import { categoryLabel, positionLabel, type PartQueryAnalysis } from "@/lib/part-query-analyzer";
import { MIN_OEM_CONFIDENCE, type OemResearchItem } from "@/lib/oem-research.server";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const MAX_QUERIES = 2;
const RESULTS_PER_QUERY = 5;
const MAX_DOC_CHARS = 6000;
const TIMEOUT_MS = 35_000;

interface WebDoc {
  url: string;
  title: string;
  text: string;
}

/** Web'de aranacak sorgular — OEM katalog/yedek parça kaynaklarını hedefler. */
export function buildWebQueries(analysis: PartQueryAnalysis): string[] {
  const part = categoryLabel(analysis.partCategory) ?? analysis.originalQuery;
  const pos = positionLabel(analysis.position);
  const vehicle = [analysis.brand, analysis.model].filter(Boolean).join(" ");
  if (!vehicle) return [];
  const label = [pos, part].filter(Boolean).join(" ");
  return [
    `${vehicle} ${label} OEM numarası`,
    `${vehicle} ${label} OEM part number catalog`,
  ].slice(0, MAX_QUERIES);
}

function stripHtml(s: string): string {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

async function firecrawlSearch(query: string, key: string, signal: AbortSignal): Promise<WebDoc[]> {
  const res = await fetch(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: RESULTS_PER_QUERY,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.warn("[web-oem-research] firecrawl", res.status, body.slice(0, 200));
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const j = parsed as {
    data?: { web?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  };
  const raw = Array.isArray(j.data) ? j.data : (j.data?.web ?? []);

  const docs: WebDoc[] = [];
  for (const r of raw) {
    const url = String((r["url"] as string) ?? ((r["metadata"] as { sourceURL?: string })?.sourceURL ?? ""));
    if (!url) continue;
    const md = String((r["markdown"] as string) ?? (r["description"] as string) ?? "");
    const text = stripHtml(md).slice(0, MAX_DOC_CHARS);
    if (text.length < 40) continue;
    docs.push({ url, title: String((r["title"] as string) ?? "").slice(0, 200), text });
  }
  return docs;
}

/** OEM formatı: 5-20 karakter, en az 4 rakam. */
function isPlausibleOem(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (c.length < 5 || c.length > 20) return false;
  if (!/^[A-Z0-9][A-Z0-9\-. ]*$/.test(c)) return false;
  return (c.match(/\d/g) ?? []).length >= 4;
}

/** Sayfa metninde OEM koduna benzeyen adayları çıkarır (kanıt amaçlı). */
export function extractOemCandidates(text: string): string[] {
  const out = new Set<string>();
  const re = /\b[A-Z0-9]{2,}[A-Z0-9\-.]{2,}\b/g;
  const upper = text.toUpperCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(upper)) !== null) {
    const code = m[0];
    if (isPlausibleOem(code)) out.add(code);
    if (out.size > 400) break;
  }
  return Array.from(out);
}

/** Kod gerçekten kaynak metinlerinden birinde geçiyor mu? (uydurma engeli) */
function foundInDocs(code: string, docs: WebDoc[]): WebDoc | null {
  const key = normalizeOem(code);
  if (!key) return null;
  for (const d of docs) {
    const hay = normalizeOem(d.text.toUpperCase().replace(/\s+/g, ""));
    if (hay.includes(key)) return d;
  }
  return null;
}

/** Satıcı/pazaryeri alan adları — orijinal OE kanıtı olarak kabul EDİLMEZ. */
const MARKETPLACE_HOSTS = [
  "hepsiburada", "trendyol", "n11", "gittigidiyor", "amazon", "ebay", "aliexpress",
  "sahibinden", "letgo", "dolap", "pazarama", "ciceksepeti", "akakce", "cimri",
  "shopier", "etsy", "alibaba", "temu",
];

/**
 * Üretici ile açık ilişkisi olan / OE katalog kaynakları.
 * Bu alan adlarındaki açık OE ifadesi en yüksek kanıt değerine sahiptir.
 */
const OFFICIAL_CATALOG_HOSTS = [
  "parts-catalogs", "partsouq", "epcdata", "catcar", "amayama", "impex-jp",
  "megazip", "japan-parts", "autopartspro", "oemcats", "parts.", "epc.",
  "chery", "toyota", "nissan", "hyundai", "honda", "volkswagen", "audi",
  "skoda", "seat", "renault", "dacia", "peugeot", "citroen", "opel", "kia",
  "suzuki", "ssangyong", "mgmotor", "byd",
];

/** Güvenilir teknik/çapraz referans katalogları (satıcıdan iyi, resmi katalogdan zayıf). */
const TRUSTED_CATALOG_HOSTS = [
  "oscaro", "autodoc", "tecdoc", "partslink24", "oemepc", "carparts",
  "buyautoparts", "rockauto", "onlinecarparts", "boodmo", "parts-catalog",
];

/** Aftermarket üretici markaları — bu markaların numarası OE DEĞİLDİR. */
const AFTERMARKET_BRANDS = [
  "bosch", "brembo", "textar", "ferodo", "trw", "ate", "valeo", "delphi",
  "mando", "sangsin", "hi-q", "nipparts", "blue print", "febi", "swag",
  "mahle", "mann", "knecht", "lynx", "japko", "kavo", "ashika", "flow", "frow",
  "gkn", "hella", "denso", "ngk", "sct", "corteco", "sasic", "metelli",
];

/** Muadil/çapraz referans ifadeleri — tek başına orijinal OE kanıtı sayılmaz. */
const CROSS_REF_MARKERS = [
  "muadil", "muadili", "eşdeğer", "esdeger", "equivalent", "replacement",
  "cross reference", "çapraz referans", "capraz referans", "oem compatible",
  "oem equivalent", "oem quality", "oem replacement", "compatible with oem",
  "uyumlu", "compatible with", "aftermarket", "yan sanayi",
];

/** Satıcı SKU / stok kodu ifadeleri — OEM olarak ASLA kabul edilmez. */
const SKU_MARKERS = [
  "sku", "stok kodu", "stok no", "ürün kodu", "urun kodu", "product code",
  "item code", "item no", "barkod", "barcode", "raf kodu", "referans kodu",
  "mpn", "model kodu", "katalog no",
];

/** Kodun OE numarası olduğunu açıkça belirten ifadeler. */
const OE_MARKERS = [
  "oe numarası", "oe no", "oe kodu", "orijinal numara", "orijinal parça numarası",
  "oem numarası", "oem no", "oem kodu", "oe part number", "oem part number",
  "genuine part number", "original part number", "üretici numarası",
  "original part no", "oe reference", "orjinal parça numarası",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isMarketplace(url: string): boolean {
  const h = hostOf(url);
  return MARKETPLACE_HOSTS.some((m) => h.includes(m));
}

/** Kaynak puanı: 100 resmi/üretici katalog, 70 güvenilir katalog, 40 diğer, 10 pazaryeri. */
export function scoreSource(url: string): number {
  const h = hostOf(url);
  if (!h) return 0;
  if (MARKETPLACE_HOSTS.some((m) => h.includes(m))) return 10;
  if (OFFICIAL_CATALOG_HOSTS.some((m) => h.includes(m))) return 100;
  if (TRUSTED_CATALOG_HOSTS.some((m) => h.includes(m))) return 70;
  return 40;
}

/** Kodun geçtiği tüm bağımsız alan adları (aynı domain 1 kez sayılır). */
function supportingHosts(code: string, docs: WebDoc[]): WebDoc[] {
  const perHost = new Map<string, WebDoc>();
  for (const d of docs) {
    if (!foundInDocs(code, [d])) continue;
    const h = hostOf(d.url);
    if (!h || perHost.has(h)) continue;
    perHost.set(h, d);
  }
  return Array.from(perHost.values());
}

/** Kodun 200 karakterlik çevresindeki bağlam işaretleri. */
function contextFlags(
  code: string,
  doc: WebDoc,
): { oe: boolean; crossRef: boolean; sku: boolean; aftermarket: boolean } {
  const lower = doc.text.toLocaleLowerCase("tr");
  const needle = code.toLocaleLowerCase("tr");
  const bare = normalizeOem(code).toLowerCase();
  let idx = lower.indexOf(needle);
  if (idx < 0) idx = lower.replace(/[\s\-.]/g, "").indexOf(bare);
  const window = idx >= 0 ? lower.slice(Math.max(0, idx - 200), idx + 200) : lower.slice(0, 600);
  return {
    oe: OE_MARKERS.some((m) => window.includes(m)),
    crossRef: CROSS_REF_MARKERS.some((m) => window.includes(m)),
    sku: SKU_MARKERS.some((m) => window.includes(m)),
    aftermarket: AFTERMARKET_BRANDS.some((m) => window.includes(m)),
  };
}


const SYSTEM_PROMPT = `Sen otomotiv ORİJİNAL (OE) parça numarası doğrulayıcısısın.
Sana GERÇEK web sayfalarından alınmış metinler verilecek.
Görevin: verilen araç ve parça için, metinlerde AÇIKÇA ARAÇ ÜRETİCİSİNİN OE numarası olarak belirtilen kodları seçmek.

MUTLAK KURALLAR:
- Yalnızca sana verilen metinlerde birebir geçen kodları döndür. Kod UYDURMA.
- Bir sayfada bir numaranın geçmesi, o numaranın OEM olduğu anlamına GELMEZ.
- evidence_type alanını şu sınıflardan biriyle dürüstçe doldur:
  * "ORIGINAL_OE": metin bu kodu açıkça araç üreticisinin orijinal OE/OEM numarası olarak belirtiyor.
    Güçlü kanıt örnekleri: "Chery OEM: T1E-3501080", "OE Number: T1E-3501080", "Original Chery Part Number: ...".
  * "AFTERMARKET_PART_NUMBER": aftermarket üretici numarası (Bosch, Brembo, Textar, Flow/Frow, TRW vb.).
  * "SELLER_SKU": satıcı SKU'su ("SKU: 8861101001", "Ürün Kodu: ...").
  * "STOCK_CODE": stok/raf/barkod kodu ("Stok Kodu: ...").
  * "CROSS_REFERENCE": muadil / eşdeğer / uyumlu / cross reference kodu.
  * "UNKNOWN": bağlam belirsiz.
- Satıcı SKU'su, stok kodu veya aftermarket parça numarası ASLA "ORIGINAL_OE" değildir.
- "OEM equivalent", "OEM quality", "OEM replacement", "compatible with OEM", "cross reference", "muadil"
  ifadeleri tek başına ORİJİNAL OE kanıtı DEĞİLDİR → bunlar "CROSS_REFERENCE".
- brand_match: kod, istenen araç markasıyla açıkça ilişkilendirilmiş mi?
- model_match / position_match: metin model ve konum (ön/arka) uyumunu doğruluyor mu?
- evidence_quote: kodun geçtiği cümleyi metinden birebir kopyala (max 200 karakter).
- Emin değilsen o kodu hiç döndürme. Boş liste yanlış cevaptan İYİDİR.
- confidence: 0-1 arası gerçekçi güven.`;


async function selectWithAi(analysis: PartQueryAnalysis, docs: WebDoc[]): Promise<OemResearchItem[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || !docs.length) return [];

  const sources = docs
    .map((d, i) => `[${i}] ${d.url}\nBaşlık: ${d.title}\nMetin: ${d.text.slice(0, 2500)}`)
    .join("\n\n---\n\n");

  const userMsg = [
    `Araç markası: ${analysis.brand ?? "bilinmiyor"}`,
    `Model: ${analysis.model ?? "bilinmiyor"}`,
    `Parça: ${categoryLabel(analysis.partCategory) ?? analysis.originalQuery}`,
    `Konum: ${positionLabel(analysis.position) ?? "belirtilmemiş"}`,
    "",
    "KAYNAKLAR:",
    sources,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_oems",
            description: "Kaynak metinlerde geçen OEM adaylarını döndür.",
            parameters: {
              type: "object",
              properties: {
                oems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      oem: { type: "string" },
                      confidence: { type: "number" },
                      source_index: { type: "number" },
                      evidence_type: {
                        type: "string",
                        enum: [
                          "ORIGINAL_OE",
                          "AFTERMARKET_PART_NUMBER",
                          "SELLER_SKU",
                          "STOCK_CODE",
                          "CROSS_REFERENCE",
                          "UNKNOWN",
                        ],
                      },
                      brand_match: { type: "boolean" },
                      model_match: { type: "boolean" },
                      position_match: { type: "boolean" },
                      evidence_quote: { type: "string" },
                    },
                    required: ["oem", "confidence", "source_index", "evidence_type", "brand_match", "evidence_quote"],
                    additionalProperties: false,
                  },

                },
              },
              required: ["oems"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_oems" } },
    }),
  });

  if (!res.ok) {
    console.warn("[web-oem-research] gateway", res.status);
    return [];
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];

  let parsed: {
    oems?: Array<{
      oem?: string;
      confidence?: number;
      source_index?: number;
      evidence_type?: string;
      brand_match?: boolean;
      evidence_quote?: string;
    }>;
  };
  try {
    parsed = JSON.parse(args) as typeof parsed;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const items: OemResearchItem[] = [];
  for (const raw of parsed.oems ?? []) {
    const oem = String(raw.oem ?? "").trim().toUpperCase();
    const conf = Number(raw.confidence);
    if (!isPlausibleOem(oem)) continue;
    if (!Number.isFinite(conf) || conf < MIN_OEM_CONFIDENCE) continue;

    // Kanıt: kod gerçekten kaynak metinde geçmeli.
    const idx = Number(raw.source_index);
    const cited = Number.isInteger(idx) && idx >= 0 && idx < docs.length ? docs[idx] : undefined;
    const evidence = (cited && foundInDocs(oem, [cited])) ?? foundInDocs(oem, docs);
    if (!evidence) continue;

    const key = normalizeOem(oem);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // --- SIKI OE DOĞRULAMASI + KAYNAK PUANLAMASI ---
    const VALID_TYPES = [
      "ORIGINAL_OE",
      "AFTERMARKET_PART_NUMBER",
      "SELLER_SKU",
      "STOCK_CODE",
      "CROSS_REFERENCE",
      "UNKNOWN",
    ] as const;
    type EvType = (typeof VALID_TYPES)[number];
    const declared = String(raw.evidence_type ?? "UNKNOWN").toUpperCase() as EvType;
    const brandMatch = raw.brand_match === true;

    const supporters = supportingHosts(oem, docs);
    // OE kanıtı: pazaryeri değil + açık OE ifadesi + muadil/SKU/aftermarket bağlamı yok.
    const oeSupporters = supporters
      .filter((d) => {
        if (isMarketplace(d.url)) return false;
        const f = contextFlags(oem, d);
        return f.oe && !f.crossRef && !f.sku && !f.aftermarket;
      })
      .sort((a, b) => scoreSource(b.url) - scoreSource(a.url));
    const independentCount = oeSupporters.length;
    const bestScore = oeSupporters.length ? scoreSource(oeSupporters[0]!.url) : 0;

    // Bağlamda SKU / stok / aftermarket marka varsa AI'nın ORIGINAL_OE iddiası geçersizdir.
    const ctxAll = supporters.map((d) => contextFlags(oem, d));
    const skuCtx = ctxAll.some((f) => f.sku);
    const aftermarketCtx = ctxAll.some((f) => f.aftermarket);

    let evidenceType: EvType = VALID_TYPES.includes(declared) ? declared : "UNKNOWN";
    if (evidenceType === "ORIGINAL_OE" && independentCount === 0) {
      evidenceType = skuCtx ? "SELLER_SKU" : aftermarketCtx ? "AFTERMARKET_PART_NUMBER" : "UNKNOWN";
    }

    /**
     * Aktif OE kabulü:
     *  - sınıf ORIGINAL_OE, marka eşleşiyor, SKU/aftermarket bağlamı yok
     *  - VE (en az 2 bağımsız kaynak) VEYA (tek kaynak ama resmi/üretici kataloğu, skor 100)
     */
    const verifiedOriginalOe =
      evidenceType === "ORIGINAL_OE" &&
      brandMatch &&
      !skuCtx &&
      !aftermarketCtx &&
      (independentCount >= 2 || (independentCount === 1 && bestScore >= 100));

    const best = oeSupporters[0] ?? evidence;
    const host = hostOf(best.url) || "web";
    items.push({
      oem,
      confidence: Math.min(1, conf),
      sourceName: (best.title || host).slice(0, 120),
      sourceUrl: best.url.slice(0, 500),
      evidenceType,
      sourceCount: independentCount,
      sourceScore: bestScore || scoreSource(best.url),
      verifiedOriginalOe,
    });
    if (items.length >= 5) break;
  }
  return items.sort(
    (a, b) =>
      Number(b.verifiedOriginalOe) - Number(a.verifiedOriginalOe) ||
      (b.sourceScore ?? 0) - (a.sourceScore ?? 0) ||
      b.confidence - a.confidence,
  );
}


/**
 * Gerçek web araması + AI seçimi ile OEM adayları döndürür.
 * Firecrawl anahtarı yoksa veya sonuç bulunamazsa boş dizi döner (mevcut akış bozulmaz).
 */
export async function researchOEMsFromWeb(analysis: PartQueryAnalysis): Promise<OemResearchItem[]> {
  const key = process.env["FIRECRAWL_API_KEY"];

  if (!key) {
    console.info("[web-oem-research]", JSON.stringify({ skipped: "no_firecrawl_key" }));
    return [];
  }

  const queries = buildWebQueries(analysis);
  if (!queries.length) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const docs: WebDoc[] = [];
  try {
    const batches = await Promise.all(
      queries.map((q) =>
        firecrawlSearch(q, key, controller.signal).catch((e: unknown) => {
          console.warn("[web-oem-research] search", e instanceof Error ? e.message : e);
          return [] as WebDoc[];
        }),
      ),
    );
    const seenUrl = new Set<string>();
    for (const d of batches.flat()) {
      if (seenUrl.has(d.url)) continue;
      seenUrl.add(d.url);
      docs.push(d);
    }
  } finally {
    clearTimeout(timer);
  }

  if (!docs.length) {
    console.info("[web-oem-research]", JSON.stringify({ queries, docs: 0, found: 0 }));
    return [];
  }

  let items: OemResearchItem[] = [];
  try {
    items = await selectWithAi(analysis, docs);
  } catch (e) {
    console.warn("[web-oem-research] select", e);
  }

  console.info(
    "[web-oem-research]",
    JSON.stringify({
      queries,
      docs: docs.length,
      found: items.length,
      verified: items.filter((i) => i.verifiedOriginalOe).length,
      oems: items.map((i) => ({
        oem: i.oem,
        type: i.evidenceType,
        sources: i.sourceCount,
        verified_original_oe: i.verifiedOriginalOe,
      })),
    }),
  );

  return items;
}

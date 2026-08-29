/**
 * XML feed parsing + field mapping.
 * Server-only (uses Node Buffer + gzip). Never import from client modules.
 *
 * Strategy:
 *  - Accept raw XML, gzip-compressed XML, or HTTP response bytes.
 *  - Tolerant field detection: tries common Turkish + English element names for
 *    OEM, title, brand, model, price, stock, images, etc.
 *  - Returns a normalized list of FeedItem records the sync engine can upsert.
 */

import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "zlib";

export interface FeedItem {
  external_sku: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  oem_codes: string[];
  price: number | null;
  stock: number;
  photos: string[];
  condition: "new" | "used" | "refurbished";
  raw_index: number;
}

export interface ParsedFeed {
  items: FeedItem[];
  errors: { index: number; reason: string }[];
  brand_count: number;
  oem_count: number;
  image_count: number;
}

// Try in order — first non-empty wins
const FIELD_ALIASES = {
  sku: ["stok_kodu", "stokkodu", "stockcode", "sku", "kod", "code", "urunkodu", "product_code"],
  title: ["urun_adi", "urunadi", "ad", "isim", "title", "name", "product_name", "baslik"],
  description: ["aciklama", "description", "detay", "info", "summary"],
  brand: ["marka", "brand", "manufacturer", "uretici"],
  model: ["model", "araba", "vehicle", "arac"],
  year: ["yil", "year", "model_yili"],
  category: ["kategori", "category", "kategori_adi", "categoryname"],
  oem: ["oem", "oem_no", "oem_kodu", "oem_code", "oemcode", "orijinal_kod", "oe_number"],
  oem_list: ["oem_kodlari", "oem_codes", "oemler", "muadiller", "cross_reference"],
  price: ["fiyat", "price", "satis_fiyati", "satisfiyati", "sale_price"],
  stock: ["stok", "stock", "stok_adedi", "miktar", "quantity", "qty", "adet"],
  image: ["resim", "image", "resim_url", "photo", "img", "picture", "gorsel"],
  image_list: ["resimler", "images", "photos", "gallery", "fotograflar", "gorseller"],
  condition: ["durum", "condition", "state"],
} as const;

const ITEM_NAMES = ["product", "urun", "item", "row", "entity", "Product", "Item", "Urun"];

function bytesLookGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function pickString(node: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    for (const variant of [k, k.toLowerCase(), k.toUpperCase()]) {
      const raw = node[variant];
      if (raw == null) continue;
      // Some tags are force-arrayed by parser config (e.g. <oem>); take first non-empty
      const v = Array.isArray(raw) ? raw.find((x) => x != null) : raw;
      if (v == null) continue;
      let s = "";
      if (typeof v === "string") s = v;
      else if (typeof v === "number") s = String(v);
      else if (typeof v === "object" && typeof (v as { "#text"?: unknown })["#text"] === "string") {
        s = String((v as { "#text": string })["#text"]);
      }
      const t = s.trim();
      if (t) return t;
    }
  }
  return null;
}

function pickNumber(node: Record<string, unknown>, keys: readonly string[]): number | null {
  const s = pickString(node, keys);
  if (!s) return null;
  // Accept "1.250,50" or "1,250.50" or "1250.50"
  const normalized = s.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pickImages(node: Record<string, unknown>): string[] {
  const out: string[] = [];
  // images container with nested items
  for (const k of FIELD_ALIASES.image_list) {
    const v = node[k] ?? node[k.toUpperCase()];
    if (!v) continue;
    if (Array.isArray(v)) {
      for (const im of v) {
        if (typeof im === "string") out.push(im.trim());
        else if (im && typeof im === "object") {
          const inner = pickString(im as Record<string, unknown>, FIELD_ALIASES.image);
          if (inner) out.push(inner);
          else if (typeof (im as { "#text"?: unknown })["#text"] === "string") {
            out.push(String((im as { "#text": string })["#text"]).trim());
          }
        }
      }
    } else if (typeof v === "object" && v) {
      // { resim: ["..", ".."] } or { image: "..." }
      const inner = (v as Record<string, unknown>);
      for (const k2 of FIELD_ALIASES.image) {
        const got = inner[k2] ?? inner[k2.toUpperCase()];
        if (Array.isArray(got)) {
          for (const im of got) {
            if (typeof im === "string") out.push(im.trim());
          }
        } else if (typeof got === "string") {
          out.push(got.trim());
        }
      }
    } else if (typeof v === "string") {
      out.push(v.trim());
    }
  }
  // single image fields
  for (const k of FIELD_ALIASES.image) {
    const v = node[k] ?? node[k.toUpperCase()];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) {
      for (const im of v) if (typeof im === "string") out.push(im.trim());
    }
  }
  // Dedup + only valid URLs
  return Array.from(
    new Set(
      out
        .filter((u) => /^https?:\/\//i.test(u))
        .map((u) => u.replace(/\s+/g, ""))
        .slice(0, 20),
    ),
  );
}

function pickOemCodes(node: Record<string, unknown>): string[] {
  const out: string[] = [];
  const single = pickString(node, FIELD_ALIASES.oem);
  if (single) {
    for (const s of single.split(/[;,|]+/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  for (const k of FIELD_ALIASES.oem_list) {
    const v = node[k] ?? node[k.toUpperCase()];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(item.trim());
        else if (item && typeof item === "object") {
          const inner = pickString(item as Record<string, unknown>, FIELD_ALIASES.oem);
          if (inner) out.push(inner);
        }
      }
    } else if (typeof v === "string") {
      for (const s of v.split(/[;,|]+/)) {
        const t = s.trim();
        if (t) out.push(t);
      }
    } else if (v && typeof v === "object") {
      // Container like <oem_kodlari><oem>X</oem><oem>Y</oem></oem_kodlari>
      const inner = v as Record<string, unknown>;
      for (const k2 of FIELD_ALIASES.oem) {
        const got = inner[k2] ?? inner[k2.toUpperCase()];
        if (Array.isArray(got)) {
          for (const im of got) {
            if (typeof im === "string") out.push(im.trim());
          }
        } else if (typeof got === "string") {
          for (const s of got.split(/[;,|]+/)) {
            const t = s.trim();
            if (t) out.push(t);
          }
        }
      }
    }
  }
  // Normalize: uppercase, strip whitespace/punctuation in the middle? Keep human form;
  // we rely on parts_normalize_oem trigger + normalize_oem() SQL function for matching.
  return Array.from(
    new Set(
      out
        .map((s) => s.toUpperCase().trim())
        .filter((s) => s.length >= 3 && s.length <= 40),
    ),
  ).slice(0, 12);
}

function findItemsAnywhere(root: unknown): Record<string, unknown>[] {
  // Walk the object tree shallowly looking for an array of objects whose
  // siblings look like product nodes (e.g. arrays under <products>).
  if (!root || typeof root !== "object") return [];
  const queue: unknown[] = [root];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;
    for (const name of ITEM_NAMES) {
      const v = obj[name];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        return v as Record<string, unknown>[];
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        // single-item feed
        return [v as Record<string, unknown>];
      }
    }
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "object") queue.push(obj[k]);
    }
  }
  return [];
}

export function decodeXmlBytes(buf: Buffer): string {
  if (bytesLookGzip(buf)) {
    return gunzipSync(buf).toString("utf-8");
  }
  return buf.toString("utf-8");
}

function bytesLookZip(buf: Buffer): boolean {
  // Local file header "PK\x03\x04" or empty archive "PK\x05\x06"
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

/**
 * Universal XML extractor — accepts plain XML, gzip, or zip archives.
 * For zip files, returns the first .xml entry found (largest by size if multiple).
 * Always async because JSZip's API is async.
 */
export async function extractXmlString(buf: Buffer): Promise<{ xml: string; source_name?: string }> {
  if (bytesLookZip(buf)) {
    const JSZipMod = await import("jszip");
    const JSZip = JSZipMod.default ?? JSZipMod;
    const zip = await JSZip.loadAsync(buf);
    const xmlEntries = Object.values(zip.files).filter(
      (f) => !f.dir && /\.xml$/i.test(f.name),
    );
    if (xmlEntries.length === 0) {
      throw new Error("ZIP içinde .xml dosyası bulunamadı");
    }
    // Pick the largest XML (most likely the data feed, not a manifest)
    xmlEntries.sort(
      (a, b) =>
        // @ts-expect-error _data is internal but stable in jszip v3
        ((b._data?.uncompressedSize ?? 0) as number) - ((a._data?.uncompressedSize ?? 0) as number),
    );
    const entry = xmlEntries[0];
    const inner = Buffer.from(await entry.async("uint8array"));
    // Inner file could itself be gzipped (rare)
    const xml = bytesLookGzip(inner)
      ? gunzipSync(inner).toString("utf-8")
      : inner.toString("utf-8");
    return { xml, source_name: entry.name };
  }
  return { xml: decodeXmlBytes(buf) };
}

export function parseXmlFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) =>
      // Force arrays for common multi-value tags
      ["resim", "image", "photo", "img", "gorsel", "oem", "oem_no"].includes(name.toLowerCase()),
  });

  let json: unknown;
  try {
    json = parser.parse(xml);
  } catch (e) {
    throw new Error(`XML ayrıştırılamadı: ${e instanceof Error ? e.message : String(e)}`);
  }

  const itemNodes = findItemsAnywhere(json);
  const errors: { index: number; reason: string }[] = [];
  const items: FeedItem[] = [];
  const brands = new Set<string>();
  const oems = new Set<string>();
  let imageCount = 0;

  itemNodes.forEach((node, idx) => {
    try {
      const title = pickString(node, FIELD_ALIASES.title);
      const oem_codes = pickOemCodes(node);
      if (!title) {
        errors.push({ index: idx, reason: "Başlık (title) bulunamadı" });
        return;
      }
      if (oem_codes.length === 0) {
        errors.push({ index: idx, reason: "OEM kodu bulunamadı" });
        return;
      }
      const photos = pickImages(node);
      const brand = pickString(node, FIELD_ALIASES.brand);
      const stockRaw = pickNumber(node, FIELD_ALIASES.stock);
      const yearRaw = pickNumber(node, FIELD_ALIASES.year);
      const conditionRaw = pickString(node, FIELD_ALIASES.condition);
      let condition: FeedItem["condition"] = "used";
      if (conditionRaw) {
        const c = conditionRaw.toLowerCase();
        if (/(yeni|new|s\u0131f\u0131r|sifir|0 km)/.test(c)) condition = "new";
        else if (/(yenilenmi|refurb)/.test(c)) condition = "refurbished";
      }
      const item: FeedItem = {
        external_sku: pickString(node, FIELD_ALIASES.sku),
        title: title.slice(0, 200),
        description: pickString(node, FIELD_ALIASES.description)?.slice(0, 2000) ?? null,
        brand: brand?.slice(0, 80) ?? null,
        model: pickString(node, FIELD_ALIASES.model)?.slice(0, 80) ?? null,
        year: yearRaw && yearRaw >= 1950 && yearRaw <= 2100 ? Math.round(yearRaw) : null,
        category: pickString(node, FIELD_ALIASES.category)?.slice(0, 80) ?? null,
        oem_codes,
        price: pickNumber(node, FIELD_ALIASES.price),
        stock: Math.max(0, Math.min(99999, Math.round(stockRaw ?? 0))),
        photos,
        condition,
        raw_index: idx,
      };
      items.push(item);
      if (brand) brands.add(brand.toLowerCase());
      for (const o of oem_codes) oems.add(o);
      imageCount += photos.length;
    } catch (e) {
      errors.push({ index: idx, reason: e instanceof Error ? e.message : "Beklenmeyen hata" });
    }
  });

  return {
    items,
    errors,
    brand_count: brands.size,
    oem_count: oems.size,
    image_count: imageCount,
  };
}

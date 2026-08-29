// Embeddings için provider-agnostic sarmalayıcı.
// Bugün Lovable AI Gateway → openai/text-embedding-3-small (1536 boyut).
// parts.embedding kolonu vector(1536) — model değişirse boyut korunmalı.

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export interface EmbeddingResult {
  ok: boolean;
  vector?: number[];
  error?: string;
  raw_status?: number;
  model_used?: string;
}

export async function embedText(input: string): Promise<EmbeddingResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, error: "AI servisi yapılandırılmamış." };
  const clean = input.trim().slice(0, 8000);
  if (!clean) return { ok: false, error: "Boş metin." };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: clean }),
    });
    if (res.status === 429) return { ok: false, error: "Rate limit", raw_status: 429 };
    if (res.status === 402) return { ok: false, error: "Kredi tükendi", raw_status: 402 };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[embeddings] error", res.status, t.slice(0, 300));
      return { ok: false, error: "Embedding hatası", raw_status: res.status };
    }
    const json = await res.json();
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
      return { ok: false, error: `Beklenmeyen boyut: ${vec?.length}` };
    }
    return { ok: true, vector: vec, model_used: EMBEDDING_MODEL };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

export async function embedBatch(inputs: string[]): Promise<EmbeddingResult[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return inputs.map(() => ({ ok: false, error: "AI yapılandırılmamış." }));
  const cleaned = inputs.map((s) => s.trim().slice(0, 8000));
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: cleaned }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[embeddings] batch error", res.status, t.slice(0, 300));
      return inputs.map(() => ({ ok: false, error: "Embedding hatası", raw_status: res.status }));
    }
    const json = await res.json();
    const data = json?.data ?? [];
    return cleaned.map((_, i) => {
      const item = data.find((d: { index: number }) => d.index === i);
      const vec = item?.embedding;
      if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
        return { ok: false, error: "Boyut hatası" };
      }
      return { ok: true, vector: vec, model_used: EMBEDDING_MODEL };
    });
  } catch (e) {
    return inputs.map(() => ({ ok: false, error: e instanceof Error ? e.message : "Ağ hatası" }));
  }
}

/** Bir ürünü tek metne indirger — embedding kaynağı. */
export function buildPartEmbeddingSource(p: {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  part_type?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  description?: string | null;
}): string {
  const parts: string[] = [];
  if (p.title) parts.push(p.title);
  if (p.brand || p.model) parts.push(`Araç: ${[p.brand, p.model, p.year].filter(Boolean).join(" ")}`);
  if (p.category) parts.push(`Kategori: ${p.category}`);
  if (p.part_type) parts.push(`Parça tipi: ${p.part_type}`);
  const oems = [p.oem_code, ...(p.oem_codes ?? [])].filter(Boolean);
  if (oems.length) parts.push(`OEM: ${oems.join(", ")}`);
  if (p.description) parts.push(String(p.description).slice(0, 1200));
  return parts.join("\n");
}

/** Basit hash (FNV-1a) — kaynağı değişmedikçe re-embed etme. */
export function sourceHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const EMBEDDING_META = { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS };

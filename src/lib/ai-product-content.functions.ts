// SEO Faz 7 — Ürün sayfası için AI ile zenginleştirilmiş içerik motoru.
// Public server fn: cache-first, sadece yeterli veri varsa AI'yı çağırır.
// Amaç: her ilan için benzersiz, kullanıcıya değer katan içerik üretmek —
// kopya içerik üretimini önlemek için template fallback'ler daima korunur.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CACHE_TTL_DAYS = 30;
const MIN_INPUT_QUALITY = 2; // en az iki temel alan (OEM, title, brand+model'den)

const inputSchema = z.object({
  id: z.string().uuid(),
});

export interface ProductAiFaq {
  q: string;
  a: string;
}

export interface ProductAiContent {
  overview: string;
  function: string;
  symptoms: string[];
  replace_when: string;
  install_notes: string;
  faq: ProductAiFaq[];
  cached: boolean;
  quality_score: number;
  generated_at: string | null;
}

function fallbackContent(part: {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  oem_code: string | null;
}): ProductAiContent {
  const veh = [part.brand, part.model].filter(Boolean).join(" ");
  return {
    overview: `${part.title}${veh ? ` (${veh})` : ""} için genel bilgi bu sayfada aşama aşama yayınlanmaktadır.`,
    function: "Bu parçanın aracınızdaki temel görevi ilanı yayınlayan satıcıdan teyit edilebilir.",
    symptoms: [],
    replace_when: "Üretici bakım aralıklarını takip edin; anormal ses, sızıntı veya performans kaybında değişimi değerlendirin.",
    install_notes: "Yetkili servis veya deneyimli usta tarafından montajı önerilir.",
    faq: [],
    cached: false,
    quality_score: 0,
    generated_at: null,
  };
}

async function loadPart(supabase: SupabaseLike, id: string) {
  const { data, error } = await supabase
    .from("parts")
    .select("id,title,brand,model,year,category,condition,engine_code,oem_code,oem_codes,description")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PartRow | null;
}

interface PartRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  condition: string | null;
  engine_code: string | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  description: string | null;
}

interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
  };
}

function inputQualityScore(p: PartRow): number {
  let s = 0;
  if (p.oem_code || (p.oem_codes && p.oem_codes.length > 0)) s += 1;
  if (p.brand && p.model) s += 1;
  if (p.category) s += 1;
  if (p.description && p.description.length > 40) s += 1;
  return s;
}

const AiResponseSchema = z.object({
  overview: z.string().min(30).max(600),
  function: z.string().min(20).max(400),
  symptoms: z.array(z.string().min(3).max(120)).max(6),
  replace_when: z.string().min(20).max(400),
  install_notes: z.string().min(20).max(400),
  faq: z
    .array(z.object({ q: z.string().min(5).max(200), a: z.string().min(10).max(500) }))
    .max(5),
});

async function callAiGateway(prompt: string, apiKey: string): Promise<z.infer<typeof AiResponseSchema> | null> {
  const sys =
    "Sen Türkiye'de otomotiv yedek parça uzmanısın. Verilen ilan verisine dayanarak DOĞRU, KULLANICIYA FAYDALI Türkçe içerik üret. " +
    "Kesin bilmediğin şeyi UYDURMA — bunun yerine genel bir bilgi ver ve emin olamadığını ima et. " +
    "Yanıtı SADECE geçerli JSON olarak döndür, ek metin ekleme. Schema: " +
    "{overview,function,symptoms[],replace_when,install_notes,faq:[{q,a}]}.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    console.warn("[ai-product-content] gateway error", res.status);
    return null;
  }
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return AiResponseSchema.parse(parsed);
  } catch (e) {
    console.warn("[ai-product-content] parse/validate failed", e);
    return null;
  }
}

function buildPrompt(p: PartRow): string {
  const oems = p.oem_codes && p.oem_codes.length > 0 ? p.oem_codes : (p.oem_code ? [p.oem_code] : []);
  const lines: string[] = [
    `Parça adı: ${p.title}`,
    oems.length > 0 ? `OEM kod(ları): ${oems.join(", ")}` : "OEM kodu belirtilmemiş.",
    p.brand ? `Marka: ${p.brand}` : "",
    p.model ? `Model: ${p.model}` : "",
    p.year ? `Yıl: ${p.year}` : "",
    p.engine_code ? `Motor kodu: ${p.engine_code}` : "",
    p.category ? `Kategori: ${p.category}` : "",
    p.condition ? `Durum: ${p.condition}` : "",
    p.description ? `Açıklama: ${p.description.slice(0, 400)}` : "",
    "",
    "İstenen alanlar:",
    "- overview: 2-3 cümle özet",
    "- function: parçanın araçtaki görevi",
    "- symptoms: arıza belirtileri (kısa madde listesi, en fazla 5)",
    "- replace_when: ne zaman/kaç km'de değiştirilmeli",
    "- install_notes: genel montaj/uyarı bilgisi (kesin talimat verme)",
    "- faq: 2-4 sık sorulan soru",
  ].filter(Boolean);
  return lines.join("\n");
}

function scoreOutput(raw: z.infer<typeof AiResponseSchema>): number {
  let s = 40;
  s += Math.min(20, Math.floor(raw.overview.length / 15));
  s += Math.min(15, raw.symptoms.length * 4);
  s += Math.min(15, raw.faq.length * 5);
  s += raw.install_notes.length > 60 ? 10 : 5;
  return Math.min(100, s);
}

export const getEnrichedProductContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ProductAiContent> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabasePublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const part = await loadPart(supabasePublic as unknown as SupabaseLike, data.id);
    if (!part) {
      return fallbackContent({ title: "Yedek parça", brand: null, model: null, category: null, oem_code: null });
    }

    // Yeterli veri yoksa AI'yı çağırmadan template döndür — kopya içerik üretme.
    if (inputQualityScore(part) < MIN_INPUT_QUALITY) {
      return fallbackContent(part);
    }

    // Admin istemci ile cache (RLS admin-only, publishable key ile okunamaz).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cacheKey = part.id;

    const { data: cached } = await supabaseAdmin
      .from("ai_content_cache")
      .select("content,quality_score,generated_at,expires_at")
      .eq("scope", "part")
      .eq("scope_key", cacheKey)
      .maybeSingle();

    if (cached && cached.expires_at && new Date(cached.expires_at) > new Date()) {
      const c = cached.content as Record<string, unknown>;
      return {
        overview: String(c.overview ?? ""),
        function: String(c.function ?? ""),
        symptoms: Array.isArray(c.symptoms) ? (c.symptoms as string[]) : [],
        replace_when: String(c.replace_when ?? ""),
        install_notes: String(c.install_notes ?? ""),
        faq: Array.isArray(c.faq) ? (c.faq as ProductAiFaq[]) : [],
        cached: true,
        quality_score: cached.quality_score ?? 0,
        generated_at: cached.generated_at ?? null,
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallbackContent(part);

    const aiResult = await callAiGateway(buildPrompt(part), apiKey);
    if (!aiResult) return fallbackContent(part);

    const quality = scoreOutput(aiResult);
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86400 * 1000).toISOString();

    await supabaseAdmin
      .from("ai_content_cache")
      .upsert({
        scope: "part",
        scope_key: cacheKey,
        content: aiResult,
        quality_score: quality,
        model: "google/gemini-3-flash-preview",
        expires_at: expiresAt,
      }, { onConflict: "scope,scope_key" });

    return {
      ...aiResult,
      cached: false,
      quality_score: quality,
      generated_at: new Date().toISOString(),
    };
  });

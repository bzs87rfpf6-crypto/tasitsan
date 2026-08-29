// Taşıtsan AI Parça Asistanı — RAG orkestratör.
// Modüller: intent → pipeline (parts→oem_kb→vehicle→synonyms→fuzzy→semantic) → answer → log.
// KURAL 1: AI hiç uydurmaz. KURAL 2: sıralı arama. KURAL 10: her arama loglanır.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { extractIntent } from "./ai/intent.server";
import { runSearchPipeline, type RankedPart, type ResultGroup } from "./ai/pipeline.server";
import { generateAnswer } from "./ai/answer.server";
import { logAiSearch } from "./ai/logger.server";
import type { OemReferenceHit } from "./ai/oem-kb.server";

export type ConfidenceTier = "certain" | "high" | "review" | "ask";

export interface AiSearchPart extends RankedPart {}
export type { OemReferenceHit } from "./ai/oem-kb.server";
export type { ResultGroup } from "./ai/pipeline.server";

export interface Clarification {
  dimension: "position" | "side";
  question: string;      // "Ön mü Arka mı?"
  options: Array<{ label: string; value: string }>;
}

export interface AiSearchResponse {
  ok: boolean;
  log_id: string | null;
  intent: {
    brand: string | null;
    model: string | null;
    year: number | null;
    category: string | null;
    part_name: string | null;
    position: string | null;
    side: string | null;
    candidate_oems: string[];
    keywords: string[];
    ai_notes: string;
  };
  db_results: {
    parts: AiSearchPart[];
    groups: Record<ResultGroup, AiSearchPart[]>;
    oem_references: OemReferenceHit[];
    similar_oems: string[];
    total_matches: number;
    stage_reached: string;
    stages_run: string[];
  };
  clarifications: Clarification[];
  auto_show: boolean;         // UI: true ise sonuçları direkt göster; false ise clarifications sor
  ai_answer: string;
  confidence: number;
  confidence_tier: ConfidenceTier;
  follow_up: string | null;
  duration_ms: number;
  duration_ms_by_stage: Record<string, number>;
}


const InputSchema = z.object({
  query: z.string().trim().min(2).max(400),
  session_id: z.string().max(64).optional(),
});

function getSbAnon() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

function tierOf(c: number): ConfidenceTier {
  if (c >= 95) return "certain";
  if (c >= 80) return "high";
  if (c >= 60) return "review";
  return "ask";
}

// Also record misses into oem_failed_searches (KURAL 5 — mevcut admin öğrenme paneli akışı).
async function logMiss(sb: ReturnType<typeof getSbAnon>, params: {
  query: string; oems: string[]; brand: string; part_name: string; reason: string;
}) {
  try {
    const primaryOem = params.oems[0] ?? params.query.slice(0, 40);
    await sb.from("oem_failed_searches").insert({
      oem: primaryOem,
      brand: params.brand || null,
      title: params.part_name || params.query.slice(0, 120),
      reason: params.reason,
      tried_queries: { query: params.query, oems: params.oems } as never,
    });
  } catch (e) {
    console.warn("[ai-search] logMiss", e);
  }
}

export const aiPartSearch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<AiSearchResponse> => {
    const sb = getSbAnon();
    const started = Date.now();

    // 1) Intent
    const intent = await extractIntent(data.query);

    // 2) Sequential retrieval pipeline (parallel stages inside)
    const pipeline = await runSearchPipeline(
      sb,
      {
        brand: intent.brand, model: intent.model, category: intent.category,
        part_name: intent.part_name, candidate_oems: intent.candidate_oems,
        keywords: intent.keywords,
        position: intent.position, side: intent.side,
      },
      data.query,
    );

    // 3) Grounded AI answer (SADECE gerçek DB bulguları)
    const summary = {
      parts: pipeline.parts.slice(0, 8).map((p) => ({
        title: p.title, brand: p.brand, model: p.model, year: p.year,
        oem_code: p.oem_code, price: p.price, city: p.city, score: p.score, reasons: p.match_reasons,
      })),
      oem_references: pipeline.oem_references.slice(0, 5),
      similar_oems: pipeline.similar_oems.slice(0, 8),
      total_matches: pipeline.parts.length,
    };
    const answer = await generateAnswer(data.query, {
      brand: intent.brand, model: intent.model, year: intent.year,
      part_name: intent.part_name, category: intent.category,
      candidate_oems: intent.candidate_oems, keywords: intent.keywords,
    }, summary);

    // Deterministik güven — AI çalışmasa bile gerçek eşleşmeye göre hesapla
    const partsCount = pipeline.parts.length;
    const topScore = pipeline.parts[0]?.score ?? 0;
    let baseConf = 0;
    if (topScore >= 180) baseConf = 95;
    else if (topScore >= 130) baseConf = 88;
    else if (topScore >= 90) baseConf = 78;
    else if (topScore >= 60) baseConf = 65;
    else if (partsCount > 0) baseConf = 45;
    const answerOk = !answer.error && answer.confidence > 0;
    const confidence = answerOk ? Math.max(answer.confidence, baseConf) : baseConf;
    const tier = tierOf(confidence);

    // AI cevap üretemezse deterministik özet göster — KULLANICIYA ASLA BOŞ DÖNME
    let answerText = answer.answer;
    if (!answerOk || !answerText || answerText.trim().length === 0) {
      if (partsCount > 0) {
        const top = pipeline.parts[0];
        const priceStr = top.price ? ` ${top.price.toLocaleString("tr-TR")} ₺` : "";
        answerText = `${partsCount} uygun ilan bulundu. En yüksek eşleşme: "${top.title}"${priceStr}. Aşağıdaki listeden inceleyebilirsin.`;
      } else {
        answerText = pipeline.oem_references.length > 0
          ? "Bu OEM için sistemde referans var ancak şu anda stokta uygun ilan bulunamadı. Parça talebi oluşturmak ister misin?"
          : "Şu anda tam eşleşme bulunamadı. Marka, model veya OEM numarasıyla arama yapmayı denersen daha net sonuç alırız.";
      }
    }

    // 3b) Clarifying questions — birden fazla geçerli eşleşme aynı boyut üzerinde bölünüyorsa
    const clarifications = deriveClarifications(pipeline.parts, intent);
    const auto_show = tier === "certain" || tier === "high" || clarifications.length === 0;

    // 4) Miss log → admin öğrenme paneli
    if (pipeline.parts.length === 0) {
      await logMiss(sb, {
        query: data.query, oems: intent.candidate_oems,
        brand: intent.brand, part_name: intent.part_name,
        reason: pipeline.oem_references.length > 0 ? "referans_var_urun_yok" : "eslesme_yok",
      });
    }

    // 5) AI analytics log
    const totalMs = Date.now() - started;
    const log_id = await logAiSearch(sb, {
      session_id: data.session_id ?? null,
      user_id: null,
      query: data.query,
      intent: {
        brand: intent.brand, model: intent.model, year: intent.year,
        part_name: intent.part_name, category: intent.category,
        position: intent.position, side: intent.side,
        keywords: intent.keywords,
      },
      candidate_oems: intent.candidate_oems,
      parts_found: pipeline.parts.length,
      oem_refs_found: pipeline.oem_references.length,
      similar_oems_found: pipeline.similar_oems.length,
      confidence,
      confidence_tier: tier,
      ai_model: intent.model_used ?? answer.model_used ?? null,
      duration_ms: totalMs,
      stage_reached: pipeline.stage_reached,
      error_message: intent.error ?? answer.error ?? null,
    });

    return {
      ok: true,
      log_id,
      intent: {
        brand: intent.brand || null,
        model: intent.model || null,
        year: intent.year > 0 ? intent.year : null,
        category: intent.category || null,
        part_name: intent.part_name || null,
        position: intent.position || null,
        side: intent.side || null,
        candidate_oems: intent.candidate_oems,
        keywords: intent.keywords,
        ai_notes: intent.ai_notes,
      },
      db_results: {
        parts: pipeline.parts,
        groups: pipeline.groups,
        oem_references: pipeline.oem_references,
        similar_oems: pipeline.similar_oems,
        total_matches: pipeline.parts.length,
        stage_reached: pipeline.stage_reached,
        stages_run: pipeline.stages_run,
      },
      clarifications,
      auto_show,
      ai_answer: answerText,
      confidence,
      confidence_tier: tier,
      follow_up: answer.follow_up || null,
      duration_ms: totalMs,
      duration_ms_by_stage: pipeline.duration_ms_by_stage,
    };
  });

// ---- Clarifying questions helper ----
function deriveClarifications(
  parts: RankedPart[],
  intent: { position: string; side: string; part_name: string },
): Clarification[] {
  const out: Clarification[] = [];
  if (parts.length < 3) return out;
  const top = parts.slice(0, 10).map((p) => (p.title ?? "").toLowerCase());

  // Position
  if (!intent.position) {
    const front = top.filter((t) => /\bön|\bon\b/.test(t)).length;
    const rear  = top.filter((t) => /arka/.test(t)).length;
    if (front >= 2 && rear >= 2) {
      out.push({
        dimension: "position",
        question: "Ön mü, arka mı?",
        options: [{ label: "Ön", value: "ön" }, { label: "Arka", value: "arka" }],
      });
    }
  }
  // Side
  if (!intent.side) {
    const left  = top.filter((t) => /\bsol\b/.test(t)).length;
    const right = top.filter((t) => /\bsağ|\bsag\b/.test(t)).length;
    if (left >= 2 && right >= 2) {
      out.push({
        dimension: "side",
        question: "Sol mu, sağ mı?",
        options: [{ label: "Sol", value: "sol" }, { label: "Sağ", value: "sağ" }],
      });
    }
  }
  return out;
}


// ---- Conversion tracking (KURAL 6/10) ----
const ConvSchema = z.object({
  log_id: z.string().uuid(),
  event: z.enum(["click", "request_created", "purchase"]),
  part_id: z.string().uuid().optional(),
});

export const recordAiSearchConversion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ConvSchema.parse(data))
  .handler(async ({ data }) => {
    const sb = getSbAnon();
    const patch: { clicked_part_id?: string | null; request_created?: boolean; purchase_completed?: boolean } = {};
    if (data.event === "click") patch.clicked_part_id = data.part_id ?? null;
    if (data.event === "request_created") patch.request_created = true;
    if (data.event === "purchase") patch.purchase_completed = true;
    const { error } = await sb.from("ai_search_logs").update(patch).eq("id", data.log_id);
    if (error) { console.warn("[ai-search] conv update", error.message); return { ok: false }; }
    return { ok: true };
  });

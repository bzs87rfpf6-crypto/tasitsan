// ai_search_logs yazımı ve dönüşüm işaretleri (KURAL 10).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

export interface LogSearchInput {
  session_id: string | null;
  user_id: string | null;
  query: string;
  intent: Record<string, unknown>;
  candidate_oems: string[];
  parts_found: number;
  oem_refs_found: number;
  similar_oems_found: number;
  confidence: number;
  confidence_tier: string;
  ai_model: string | null;
  duration_ms: number | null;
  stage_reached: string;
  error_message: string | null;
}

export async function logAiSearch(sb: Sb, input: LogSearchInput): Promise<string | null> {
  try {
    const { data, error } = await sb.from("ai_search_logs").insert({
      session_id: input.session_id,
      user_id: input.user_id,
      query: input.query,
      intent: input.intent as never,
      candidate_oems: input.candidate_oems,
      parts_found: input.parts_found,
      oem_refs_found: input.oem_refs_found,
      similar_oems_found: input.similar_oems_found,
      confidence: input.confidence,
      confidence_tier: input.confidence_tier,
      ai_model: input.ai_model,
      duration_ms: input.duration_ms,
      stage_reached: input.stage_reached,
      error_message: input.error_message,
    }).select("id").single();
    if (error) { console.warn("[ai-logger] insert failed", error.message); return null; }
    return data?.id ?? null;
  } catch (e) {
    console.warn("[ai-logger] threw", e);
    return null;
  }
}

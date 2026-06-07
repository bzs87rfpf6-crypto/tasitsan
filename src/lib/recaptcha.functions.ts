import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";

const inputSchema = z.object({
  token: z.string().min(10).max(4096),
  action: z.string().min(1).max(64),
  minScore: z.number().min(0).max(1).optional(),
});

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

/**
 * Verifies a reCAPTCHA v3 token with Google's siteverify endpoint.
 * Returns { ok: true, score } on success; { ok: false, reason } otherwise.
 * Failed verifications are logged to security_events.
 */
export const verifyRecaptcha = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      // Fail-open with a warning so a missing secret doesn't break the app,
      // but log it so admins notice.
      console.warn("[recaptcha] RECAPTCHA_SECRET_KEY not set — skipping verification");
      return { ok: true as const, score: 1, skipped: true };
    }

    const minScore = data.minScore ?? 0.5;
    let ip: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch { /* ignore */ }

    let body: SiteVerifyResponse;
    try {
      const params = new URLSearchParams({ secret, response: data.token });
      if (ip) params.set("remoteip", ip);
      const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      body = (await resp.json()) as SiteVerifyResponse;
    } catch (e: any) {
      console.error("[recaptcha] siteverify network error:", e?.message);
      return { ok: false as const, reason: "network_error", score: 0 };
    }

    const score = typeof body.score === "number" ? body.score : 0;
    const actionMatch = !body.action || body.action === data.action;
    const passed = body.success && actionMatch && score >= minScore;

    if (!passed) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("security_events").insert({
          event_type: "recaptcha_failed",
          severity: score > 0 && score < minScore ? "warn" : "critical",
          ip,
          details: {
            action: data.action,
            expected_action: data.action,
            returned_action: body.action ?? null,
            score,
            min_score: minScore,
            success: body.success,
            errors: body["error-codes"] ?? [],
          },
        });
      } catch (e: any) {
        console.error("[recaptcha] failed to log security event:", e?.message);
      }
      return {
        ok: false as const,
        reason: !body.success
          ? "invalid_token"
          : !actionMatch
          ? "action_mismatch"
          : "low_score",
        score,
      };
    }

    return { ok: true as const, score };
  });

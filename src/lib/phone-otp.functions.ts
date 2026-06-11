import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomInt } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OTP_TTL_SECONDS = 300; // 5 dk
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const phoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^[+0-9\s()-]+$/, "Geçersiz telefon");

function normalizePhone(p: string) {
  return p.replace(/[\s()-]/g, "");
}

function hashCode(code: string, userId: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

// TEST MODE: no real SMS provider configured. The generated code is returned
// to the client so the user can complete the flow during development.
const TEST_MODE = true;

export const requestPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const phone = normalizePhone(data.phone);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cooldown check: most recent row for this user
    const { data: latest } = await supabaseAdmin
      .from("phone_otp_verifications")
      .select("last_sent_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.last_sent_at) {
      const elapsed = (Date.now() - new Date(latest.last_sent_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return {
          ok: false as const,
          error: `Yeni kod için ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)} sn bekleyin.`,
        };
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

    // Invalidate previous unverified rows for this user
    await supabaseAdmin
      .from("phone_otp_verifications")
      .delete()
      .eq("user_id", userId)
      .is("verified_at", null);

    const { error: insErr } = await supabaseAdmin
      .from("phone_otp_verifications")
      .insert({
        user_id: userId,
        phone,
        code_hash: hashCode(code, userId),
        expires_at: expiresAt,
        attempts: 0,
        last_sent_at: new Date().toISOString(),
      });

    if (insErr) {
      console.error("OTP insert error", insErr);
      return { ok: false as const, error: "Kod oluşturulamadı, tekrar deneyin." };
    }

    // In a real SMS integration we'd dispatch here.
    console.log(`[OTP TEST MODE] user=${userId} phone=${phone} code=${code}`);

    // Touch supabase var to satisfy unused-var rule on supabase
    void supabase;

    return {
      ok: true as const,
      ttlSeconds: OTP_TTL_SECONDS,
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      testCode: TEST_MODE ? code : undefined,
    };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const phone = normalizePhone(data.phone);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("phone_otp_verifications")
      .select("*")
      .eq("user_id", userId)
      .eq("phone", phone)
      .is("verified_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return { ok: false as const, error: "Önce telefon için kod isteyin." };
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, error: "Kodun süresi doldu, yeniden gönder." };
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      return { ok: false as const, error: "Çok fazla yanlış deneme. Yeni kod isteyin." };
    }

    const expected = hashCode(data.code, userId);
    if (expected !== row.code_hash) {
      await supabaseAdmin
        .from("phone_otp_verifications")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return {
        ok: false as const,
        error: `Kod hatalı. ${MAX_ATTEMPTS - row.attempts - 1} deneme hakkı kaldı.`,
      };
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("phone_otp_verifications")
      .update({ verified_at: now })
      .eq("id", row.id);

    await supabaseAdmin
      .from("profiles")
      .update({ phone_verified_at: now, verified_phone: phone })
      .eq("id", userId);

    return { ok: true as const };
  });

export const getPhoneVerificationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("phone_verified_at, verified_phone")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      verifiedPhone: data?.verified_phone ?? null,
      verifiedAt: data?.phone_verified_at ?? null,
    };
  });

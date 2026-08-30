import { supabase } from "@/integrations/supabase/client";

/**
 * Google ile giriş — hem Lovable Cloud önizlemesinde hem de self-host
 * (kendi Supabase projemiz) ortamında çalışır.
 *
 * - Lovable önizleme/yayın alan adlarında: iframe uyumlu Lovable broker akışı.
 * - Kendi sunucumuzda: doğrudan Supabase OAuth (Google provider'ı Supabase
 *   Auth ayarlarından etkinleştirilmiş olmalıdır).
 */
const LOVABLE_ZONES = [
  "lovable.app",
  "lovableproject.com",
  "lovableproject-dev.com",
  "gpt-eng.com",
  "gptengineer.run",
];

export function isLovableHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return LOVABLE_ZONES.some((z) => host === z || host.endsWith("." + z));
}

export type GoogleSignInResult = { redirected?: boolean; error?: unknown };

export async function signInWithGoogle(redirectUri: string): Promise<GoogleSignInResult> {
  if (isLovableHost()) {
    const { lovable } = await import("@/integrations/lovable/index");
    return (await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectUri,
    })) as GoogleSignInResult;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUri },
  });
  if (error) return { error };
  // Supabase tam sayfa yönlendirme yapar.
  return { redirected: true };
}

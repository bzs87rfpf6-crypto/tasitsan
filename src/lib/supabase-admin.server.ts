/**
 * Sunucu tarafı Supabase erişim çözümleyicisi (self-host uyumlu).
 *
 * Neden var?
 *  - Lovable Cloud ortamında SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY /
 *    SUPABASE_SERVICE_ROLE_KEY otomatik enjekte edilir.
 *  - Self-host (VPS/Docker) ortamında yalnızca VITE_* değişkenleri veya
 *    service-role anahtarı olmadan bir kurulum bulunabilir. Bu durumda
 *    `supabaseAdmin` proxy'si ilk erişimde
 *    "Missing Supabase environment variable(s)" hatası fırlatır ve
 *    OnlineParça boru hattı komple çöker.
 *
 * Bu modül:
 *  - Env okumasını fallback'lerle tek noktada toplar (istek anında okunur).
 *  - Service-role varsa admin client, yoksa publishable (RLS'e tabi) client verir.
 *  - Yazma gerektiren işlemler için açık ve anlaşılır bir hata üretir.
 *
 * GÜVENLİK: service-role anahtarı yalnızca process.env'den okunur, asla
 * koda gömülmez, loglanmaz ve client bundle'a sızmaz (*.server.ts).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface SupabaseServerEnv {
  url: string | null;
  publishableKey: string | null;
  serviceRoleKey: string | null;
}

function pick(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** İstek anında env okur (Workers'da module scope'ta env bağlı değildir). */
export function getSupabaseServerEnv(): SupabaseServerEnv {
  return {
    url: pick("SUPABASE_URL", "VITE_SUPABASE_URL", "PUBLIC_SUPABASE_URL"),
    publishableKey: pick(
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ),
    serviceRoleKey: pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  };
}

type Client = SupabaseClient<Database>;

function build(url: string, key: string): Client {
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        // Yeni format (sb_publishable_/sb_secret_) anahtarlar JWT değildir;
        // Authorization: Bearer <key> gönderilirse PostgREST "Expected 3 parts in JWT" der.
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

let _admin: Client | null = null;
let _public: Client | null = null;

/** Service-role client — yoksa null (hata fırlatmaz). */
export function getServiceRoleClient(): Client | null {
  if (_admin) return _admin;
  const env = getSupabaseServerEnv();
  if (!env.url || !env.serviceRoleKey) return null;
  _admin = build(env.url, env.serviceRoleKey);
  return _admin;
}

/** Publishable (RLS'e tabi, anon) sunucu client'ı — yoksa null. */
export function getPublicServerClient(): Client | null {
  if (_public) return _public;
  const env = getSupabaseServerEnv();
  if (!env.url || !env.publishableKey) return null;
  _public = build(env.url, env.publishableKey);
  return _public;
}

/**
 * Okuma için en yetkili mevcut client: service-role varsa o, yoksa publishable.
 * Publishable'a düşüldüğünde RLS geçerlidir; RLS'in kapattığı satırlar dönmez.
 */
export function getServerReadClient(): Client | null {
  return getServiceRoleClient() ?? getPublicServerClient();
}

export function hasServiceRole(): boolean {
  return getServiceRoleClient() != null;
}

/** Yazma / RLS bypass gerektiren işlemler için — yoksa açıklayıcı hata. */
export function requireServiceRoleClient(operation: string): Client {
  const c = getServiceRoleClient();
  if (c) return c;
  const env = getSupabaseServerEnv();
  const missing = [...(!env.url ? ["SUPABASE_URL"] : []), ...(!env.serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : [])];
  throw new Error(
    `${operation}: yönetici (service-role) erişimi yapılandırılmamış. Eksik ortam değişkeni: ${missing.join(", ")}.`,
  );
}

/** Tek seferlik teşhis logu (anahtar değerleri asla loglanmaz). */
let logged = false;
export function logSupabaseServerEnvOnce(scope: string) {
  if (logged) return;
  logged = true;
  const env = getSupabaseServerEnv();
  console.info(
    "[supabase-env]",
    JSON.stringify({
      scope,
      url: env.url ? "set" : "missing",
      publishable_key: env.publishableKey ? "set" : "missing",
      service_role_key: env.serviceRoleKey ? "set" : "missing",
    }),
  );
}

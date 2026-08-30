/**
 * Self-host runtime env yardımcıları (saf fonksiyonlar — test edilebilir).
 * Launcher (scripts/start-selfhost.mjs) ve testler aynı mantığı paylaşır.
 */
import { existsSync, readFileSync } from "node:fs";

/** Tek bir `.env` satırını [key, value] olarak ayrıştırır; geçersizse null. */
export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
  } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    value = value.slice(1, -1);
  } else {
    // Tırnaksız değerlerde satır sonu yorumunu at: KEY=deger # açıklama
    const hash = value.indexOf(" #");
    if (hash >= 0) value = value.slice(0, hash).trim();
  }
  return [key, value];
}

/**
 * Dosyadaki değişkenleri env'e ekler; ZATEN TANIMLI olanları asla ezmez.
 * Böylece öncelik: gerçek ortam değişkenleri > önce yüklenen dosya.
 */
export function loadEnvFile(file, env) {
  if (!file || !existsSync(file)) return { loaded: 0, found: false };
  let loaded = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (env[key] === undefined) {
      env[key] = value;
      loaded += 1;
    }
  }
  return { loaded, found: true };
}

// Sunucu tarafı (SSR, server fn, auth middleware) prefix'siz isimleri okur;
// istemci build'i VITE_ karşılıklarını okur. İki yönlü aynalanır.
export const MIRROR = [
  ["SUPABASE_URL", "VITE_SUPABASE_URL"],
  ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"],
  ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"],
  ["SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_ID"],
  ["ADMIN_OWNER_USER_ID", "VITE_ADMIN_OWNER_USER_ID"],
];

const SERVICE_ROLE_ALIASES = ["SUPABASE_SECRET_KEY", "SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"];

/** Anahtar isimlerini normalize eder, iki yönlü aynalar ve üretim varsayılanlarını atar. */
export function normalizeEnv(env) {
  for (const alt of SERVICE_ROLE_ALIASES) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY && env[alt]) env.SUPABASE_SERVICE_ROLE_KEY = env[alt];
  }
  if (!env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_ANON_KEY) {
    env.SUPABASE_PUBLISHABLE_KEY = env.SUPABASE_ANON_KEY;
  }
  for (const [target, source] of MIRROR) {
    if (!env[target] && env[source]) env[target] = env[source];
  }
  for (const [target, source] of MIRROR) {
    if (!env[source] && env[target]) env[source] = env[target];
  }
  if (!env.SUPABASE_ANON_KEY && env.SUPABASE_PUBLISHABLE_KEY) {
    env.SUPABASE_ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY;
  }
  env.NODE_ENV ??= "production";
  env.PORT ??= "3000";
  env.HOST ??= "0.0.0.0";
  env.VITE_SELFHOST ??= "true";
  return env;
}

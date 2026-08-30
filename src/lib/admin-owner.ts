/**
 * Tek yönetici hesabı allowlist'i.
 *
 * Kimlik bir sır değildir; yetki yine sunucuda ve RLS'de doğrulanır.
 * Self-host kurulumlarında (kendi Supabase projeniz) kullanıcı UUID'si
 * farklı olacağından değer ortam değişkeninden okunur:
 *   - istemci/build zamanı : VITE_ADMIN_OWNER_USER_ID
 *   - sunucu (runtime)     : ADMIN_OWNER_USER_ID
 * Hiçbiri tanımlı değilse Lovable Cloud kurulumundaki mevcut sahip kullanılır.
 */
const FALLBACK_OWNER_USER_ID = "c1258e23-db3b-4368-bd81-84f2665fa48c";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readOwnerId(): string {
  const candidates: Array<string | undefined> = [];
  try {
    candidates.push(import.meta.env?.VITE_ADMIN_OWNER_USER_ID as string | undefined);
  } catch {
    /* import.meta.env yoksa yok say */
  }
  if (typeof process !== "undefined" && process.env) {
    candidates.push(process.env["ADMIN_OWNER_USER_ID"]);
    candidates.push(process.env["VITE_ADMIN_OWNER_USER_ID"]);
  }
  for (const c of candidates) {
    const v = typeof c === "string" ? c.trim() : "";
    if (UUID_RE.test(v)) return v.toLowerCase();
  }
  return FALLBACK_OWNER_USER_ID;
}

export const ADMIN_OWNER_USER_ID = readOwnerId();

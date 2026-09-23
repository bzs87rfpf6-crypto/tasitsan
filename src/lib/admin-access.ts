import { supabase } from "@/integrations/supabase/client";
import { ADMIN_OWNER_USER_ID } from "@/lib/admin-owner";

/**
 * Admin ekranlarına giriş için gerçek veritabanı rollerini RLS güvenliğiyle
 * doğrular. Bu yalnızca istemci route görünürlüğünü belirler; tüm hassas
 * işlemler sunucu tarafında ayrıca yetki kontrolünden geçmeye devam eder.
 *
 * Aynı kullanıcı için eşzamanlı UI kontrollerini tek RPC grubunda birleştirir.
 * Sonuç kısa süre cache'lenir; server-side yetkilendirme bundan etkilenmez.
 */
const CACHE_TTL_MS = 30_000;

let cachedUserId: string | null = null;
let cachedValue: boolean | null = null;
let cachedAt = 0;

let pendingUserId: string | null = null;
let pendingRequest: Promise<boolean> | null = null;

export async function hasAdminAccess(userId: string): Promise<boolean> {
  if (userId !== ADMIN_OWNER_USER_ID) return false;

  const now = Date.now();

  if (
    cachedUserId === userId &&
    cachedValue !== null &&
    now - cachedAt < CACHE_TTL_MS
  ) {
    return cachedValue;
  }

  if (pendingUserId === userId && pendingRequest) {
    return pendingRequest;
  }

  pendingUserId = userId;

  pendingRequest = (async () => {
    const [
      { data: admin, error: adminError },
      { data: superAdmin, error: superAdminError },
    ] = await Promise.all([
      supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      }),
      supabase.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      }),
    ]);

    if (adminError) throw adminError;
    if (superAdminError) throw superAdminError;

    const allowed = admin === true || superAdmin === true;

    cachedUserId = userId;
    cachedValue = allowed;
    cachedAt = Date.now();

    return allowed;
  })();

  try {
    return await pendingRequest;
  } finally {
    if (pendingUserId === userId) {
      pendingUserId = null;
      pendingRequest = null;
    }
  }
}

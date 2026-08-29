import { supabase } from "@/integrations/supabase/client";
import { ADMIN_OWNER_USER_ID } from "@/lib/admin-owner";

/**
 * Admin ekranlarına giriş için gerçek veritabanı rollerini RLS güvenliğiyle
 * doğrular. Bu yalnızca istemci route görünürlüğünü belirler; tüm hassas
 * işlemler sunucu tarafında ayrıca yetki kontrolünden geçmeye devam eder.
 */
export async function hasAdminAccess(userId: string): Promise<boolean> {
  if (userId !== ADMIN_OWNER_USER_ID) return false;

  const [{ data: admin, error: adminError }, { data: superAdmin, error: superAdminError }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);

  if (adminError) throw adminError;
  if (superAdminError) throw superAdminError;
  return admin === true || superAdmin === true;
}
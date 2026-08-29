import { ADMIN_OWNER_USER_ID } from "@/lib/admin-owner";

type AdminAuthClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
};

/**
 * Veritabanındaki tek-sahip has_role kuralını sunucu işlemlerinin zorunlu
 * yetki kapısı olarak kullanır. İstemci görünürlüğü için kullanılmaz.
 */
export async function assertOwnerAdmin(client: unknown, userId: string): Promise<void> {
  if (userId !== ADMIN_OWNER_USER_ID) throw new Error("Yetkisiz");

  const supabase = client as AdminAuthClient;
  const [{ data: admin, error: adminError }, { data: superAdmin, error: superAdminError }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);

  if (adminError) throw new Error(adminError.message ?? "Yönetici rolü doğrulanamadı");
  if (superAdminError) throw new Error(superAdminError.message ?? "Yönetici rolü doğrulanamadı");
  if (admin !== true && superAdmin !== true) throw new Error("Yetkisiz");
}
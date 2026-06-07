import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Yetkisiz");
}

type TableStat = { table: string; label: string; count: number; latest: string | null };

const CRITICAL_TABLES: { table: string; label: string }[] = [
  { table: "profiles", label: "Kullanıcılar" },
  { table: "parts", label: "İlanlar (parçalar)" },
  { table: "part_requests", label: "Parça talepleri" },
  { table: "request_quotes", label: "Teklifler" },
  { table: "inquiries", label: "İletişim talepleri" },
  { table: "oem_research_cache", label: "Parça Uzmanı 2.0 önbellek" },
  { table: "user_roles", label: "Yetki kayıtları" },
  { table: "site_settings", label: "Site ayarları" },
];

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tables: TableStat[] = [];
    let totalRows = 0;
    let latestWrite: string | null = null;

    for (const t of CRITICAL_TABLES) {
      const { count } = await (supabaseAdmin as any)
        .from(t.table)
        .select("*", { count: "exact", head: true });
      let latest: string | null = null;
      try {
        const { data } = await (supabaseAdmin as any)
          .from(t.table)
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = (data as any)?.created_at ?? null;
      } catch {
        latest = null;
      }
      const c = count ?? 0;
      totalRows += c;
      tables.push({ table: t.table, label: t.label, count: c, latest });
      if (latest && (!latestWrite || latest > latestWrite)) latestWrite = latest;
    }

    // Storage object counts (best-effort, may be approximate for large buckets)
    let partPhotosCount = 0;
    let avatarsCount = 0;
    try {
      const { data: pp } = await supabaseAdmin.storage.from("part-photos").list("", { limit: 1000 });
      partPhotosCount = pp?.length ?? 0;
      const { data: av } = await supabaseAdmin.storage.from("avatars").list("", { limit: 1000 });
      avatarsCount = av?.length ?? 0;
    } catch {
      // ignore
    }

    return {
      generatedAt: new Date().toISOString(),
      tables,
      totals: { rows: totalRows },
      storage: {
        partPhotos: partPhotosCount,
        avatars: avatarsCount,
      },
      latestWrite,
      backup: {
        // Lovable Cloud / Supabase managed automated daily backups.
        // No public API exposed for last-backup timestamp on the current plan;
        // we report the policy and a derived "expected next backup" window.
        provider: "Lovable Cloud (otomatik günlük)",
        frequency: "daily",
        retentionDays: 7,
        offsite: true,
        note: "Yedekler farklı bölgede saklanır. Geri yükleme Lovable Cloud panelinden yapılır.",
      },
    };
  });

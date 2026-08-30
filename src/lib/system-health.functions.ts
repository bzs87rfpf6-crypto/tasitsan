import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

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
    await assertOwnerAdmin(context.supabase, context.userId);
    const SELFHOST =
      process.env["VITE_SELFHOST"] === "true" || process.env["SELFHOST"] === "true";
    // Self-host'ta service-role anahtarı olmayabilir. Bu ekran yalnızca OKUMA
    // yapar; service-role varsa onu, yoksa publishable (RLS'e tabi) client'ı kullan.
    const { getServerReadClient, hasServiceRole } = await import("@/lib/supabase-admin.server");
    const client = getServerReadClient();
    if (!client) throw new Error("Supabase sunucu istemcisi yapılandırılmamış.");
    const serviceRole = hasServiceRole();

    const tables: TableStat[] = [];
    let totalRows = 0;
    let latestWrite: string | null = null;

    for (const t of CRITICAL_TABLES) {
      const { count } = await (client as any)
        .from(t.table)
        .select("*", { count: "exact", head: true });
      let latest: string | null = null;
      try {
        const { data } = await (client as any)
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
      const { data: pp } = await client.storage.from("part-photos").list("", { limit: 1000 });
      partPhotosCount = pp?.length ?? 0;
      const { data: av } = await client.storage.from("avatars").list("", { limit: 1000 });
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
      serviceRole,
      selfhost: SELFHOST,
      backup: {
        // Yönetilen ortamda (Lovable Cloud) günlük otomatik yedek vardır.
        // Self-host'ta yedekleme sunucu operatörünün sorumluluğundadır; bu ekran
        // yalnızca durumu raporlar, veritabanına dokunmaz.
        provider: SELFHOST ? "Self-host (Supabase projesi + sunucu operatörü)" : "Lovable Cloud (otomatik günlük)",
        frequency: SELFHOST ? "manual" : "daily",
        retentionDays: SELFHOST ? 0 : 7,
        offsite: !SELFHOST,
        note: SELFHOST
          ? "Self-host kurulumunda yedekleme Supabase proje ayarlarından veya sunucudaki pg_dump zamanlayıcısından yönetilir."
          : "Yedekler farklı bölgede saklanır. Geri yükleme Lovable Cloud panelinden yapılır.",
      },
    };
  });

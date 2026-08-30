import { createFileRoute } from "@tanstack/react-router";

// Basit sağlık kontrolü — Docker HEALTHCHECK ve reverse proxy için.
// Sır veya kullanıcı verisi döndürmez; yalnızca yapılandırmanın "var/yok" durumu.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { getSupabaseServerEnv, getServerReadClient, getServiceRoleClient } = await import(
          "@/lib/supabase-admin.server"
        );
        const env = getSupabaseServerEnv();

        // Gerçek bağlantı testi — yalnızca "ok/fail" bilgisi döner, veri sızmaz.
        let dbConnection: "ok" | "fail" | "unconfigured" = "unconfigured";
        const read = getServerReadClient();
        if (read) {
          try {
            const { error } = await read.from("parts").select("id", { head: true, count: "exact" }).limit(1);
            dbConnection = error ? "fail" : "ok";
          } catch {
            dbConnection = "fail";
          }
        }
        let serviceRole: "ok" | "fail" | "missing" = "missing";
        const admin = getServiceRoleClient();
        if (admin) {
          try {
            const { error } = await admin.from("parts").select("id", { head: true, count: "exact" }).limit(1);
            serviceRole = error ? "fail" : "ok";
          } catch {
            serviceRole = "fail";
          }
        }
        const onlineparca =
          !!process.env["ONLINEPARCA_LOGIN_URL"] &&
          !!process.env["ONLINEPARCA_USERNAME"] &&
          !!process.env["ONLINEPARCA_PASSWORD"];
        return new Response(
          JSON.stringify({
            status: "ok",
            time: new Date().toISOString(),
            config: {
              supabase_url: env.url ? "set" : "missing",
              supabase_publishable_key: env.publishableKey ? "set" : "missing",
              supabase_service_role_key: env.serviceRoleKey ? "set" : "missing",
              onlineparca_env_fallback: onlineparca ? "set" : "missing",
              db_connection: dbConnection,
              service_role_connection: serviceRole,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});


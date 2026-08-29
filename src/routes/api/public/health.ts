import { createFileRoute } from "@tanstack/react-router";

// Basit sağlık kontrolü — Docker HEALTHCHECK ve reverse proxy için.
// Sır veya kullanıcı verisi döndürmez; yalnızca yapılandırmanın "var/yok" durumu.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { getSupabaseServerEnv } = await import("@/lib/supabase-admin.server");
        const env = getSupabaseServerEnv();
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


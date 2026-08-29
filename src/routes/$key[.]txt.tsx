// IndexNow key verification file. Crawlers (Bing, Yandex, Naver) fetch
// https://www.tasitsan.com.tr/<key>.txt to confirm we own the key we sign with.
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/$key.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const requested = (params as Record<string, string>)["key.txt"] ?? (params as Record<string, string>)["key"];
        if (!requested || requested.length < 8 || requested.length > 128 || !/^[a-zA-Z0-9-]+$/.test(requested)) {
          throw notFound();
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("site_settings")
          .select("indexnow_key")
          .limit(1)
          .maybeSingle();
        const key = (data as { indexnow_key?: string } | null)?.indexnow_key;
        if (!key || key !== requested) throw notFound();
        return new Response(key, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});

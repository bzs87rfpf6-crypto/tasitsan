/**
 * Cron endpoint — pops due XML feeds and runs them.
 *
 * Auth: requires `x-cron-secret` header matching app_secrets.xml_cron_secret.
 * The secret is generated per-project and stored server-side; never exposed
 * to the browser. Falling back to publishable key auth is intentionally
 * removed because that key is public.
 *
 * Scheduled by pg_cron every 15 minutes via:
 *   SELECT net.http_post(
 *     url := '<published-url>/api/public/hooks/xml-sync',
 *     headers := jsonb_build_object(
 *       'Content-Type', 'application/json',
 *       'x-cron-secret', (SELECT value FROM public.app_secrets WHERE key='xml_cron_secret')
 *     ),
 *     body := '{}'::jsonb
 *   );
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/xml-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!provided) {
          return new Response(JSON.stringify({ error: "Missing x-cron-secret" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: secretRow } = await supabaseAdmin
          .from("app_secrets")
          .select("value")
          .eq("key", "xml_cron_secret")
          .maybeSingle();
        const expected = (secretRow?.value as string | undefined) ?? "";

        // Constant-time compare to avoid timing leaks
        let ok = expected.length === provided.length && expected.length > 0;
        if (ok) {
          let diff = 0;
          for (let i = 0; i < expected.length; i++) {
            diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
          }
          ok = diff === 0;
        }
        if (!ok) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { runFeedSync } = await import("@/lib/xml-sync.server");

        const { data: due, error } = await supabaseAdmin.rpc("xml_feeds_due_for_sync", {
          _limit: 5,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const feeds = (due ?? []) as Array<{
          id: string;
          seller_id: string;
          url: string;
          name: string;
          missing_item_action: "set_zero" | "deactivate" | "ignore";
          sync_interval: "hourly" | "6h" | "12h" | "daily" | "weekly";
        }>;

        const summaries: Array<{
          feed_id: string;
          status: string;
          added: number;
          updated: number;
          failed: number;
        }> = [];

        for (const feed of feeds) {
          try {
            const { result } = await runFeedSync(supabaseAdmin, feed, "cron");
            summaries.push({
              feed_id: feed.id,
              status: result.status,
              added: result.items_added,
              updated: result.items_updated,
              failed: result.items_failed,
            });
          } catch (e) {
            summaries.push({
              feed_id: feed.id,
              status: "failed",
              added: 0,
              updated: 0,
              failed: 0,
            });
            console.error("[xml-sync] feed failed", feed.id, e);
          }
        }

        return new Response(
          JSON.stringify({ processed: summaries.length, summaries }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://api.indexnow.org/IndexNow";
const HOST = "tasitsan.com.tr";
const BASE = "https://www.tasitsan.com.tr";
const BATCH = 5000;

export const Route = createFileRoute("/api/public/hooks/indexnow-flush")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Read indexnow key
        const { data: settings } = await supabaseAdmin
          .from("site_settings")
          .select("indexnow_key")
          .limit(1)
          .maybeSingle();
        const key = (settings as { indexnow_key?: string } | null)?.indexnow_key;
        if (!key) return Response.json({ ok: false, error: "no indexnow_key configured" }, { status: 500 });

        // Fetch pending URLs
        const { data: rows, error } = await supabaseAdmin
          .from("indexnow_queue")
          .select("id,url")
          .eq("status", "pending")
          .order("enqueued_at", { ascending: true })
          .limit(BATCH);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        const items = (rows ?? []) as Array<{ id: string; url: string }>;
        if (items.length === 0) return Response.json({ ok: true, flushed: 0 });

        const urlList = Array.from(new Set(items.map((r) => r.url)));
        const ids = items.map((r) => r.id);

        let success = false;
        let errMsg: string | null = null;
        try {
          const resp = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              host: HOST,
              key,
              keyLocation: `${BASE}/${key}.txt`,
              urlList,
            }),
          });
          if (resp.status >= 200 && resp.status < 300) success = true;
          else errMsg = `IndexNow returned HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
        } catch (e) {
          errMsg = e instanceof Error ? e.message : String(e);
        }

        await supabaseAdmin
          .from("indexnow_queue")
          .update(
            success
              ? { status: "sent", sent_at: new Date().toISOString() }
              : { status: "failed", last_error: errMsg, attempts: 1 },
          )
          .in("id", ids);

        return Response.json({ ok: success, flushed: items.length, error: errMsg });
      },
    },
  },
});

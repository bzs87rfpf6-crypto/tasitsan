/**
 * Public image proxy for the private part-images bucket.
 * URL: /api/public/img/<storage-path>
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params._splat ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..") || path.length > 200) {
          return new Response("Bad path", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("part-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        const ext = path.split(".").pop()?.toLowerCase();
        const ct =
          ext === "png" ? "image/png" :
          ext === "webp" ? "image/webp" :
          ext === "gif" ? "image/gif" : "image/jpeg";
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": ct,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});

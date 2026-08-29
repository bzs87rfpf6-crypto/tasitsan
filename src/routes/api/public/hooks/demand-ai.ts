import { createFileRoute } from "@tanstack/react-router";

/** Gece cron'u: talep puanlarını tazeler ve AI analizini üretir. */
export const Route = createFileRoute("/api/public/hooks/demand-ai")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runDemandAnalysis } = await import("@/lib/demand-ai.server");
          const result = await runDemandAnalysis();
          return Response.json({ ok: true, generated_at: result.generated_at });
        } catch (e) {
          console.error("[demand-ai hook]", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});

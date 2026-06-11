import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";

export const Route = createFileRoute("/api/public/alert-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Auth
        const provided = request.headers.get("x-push-secret") ?? "";
        const { data: secretRow } = await supabaseAdmin
          .from("app_secrets").select("value").eq("key", "push_dispatch_secret").maybeSingle();
        const expected = (secretRow?.value ?? "") as string;
        if (!expected || provided.length === 0 || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { part_id?: string } = {};
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        if (!body.part_id) return new Response("Missing part_id", { status: 400 });

        // Load part
        const { data: part } = await supabaseAdmin
          .from("parts")
          .select("id,title,brand,model,category,oem_code,oem_codes,status,seller_id")
          .eq("id", body.part_id).maybeSingle();
        if (!part || part.status !== "approved") return new Response("Skip", { status: 200 });

        // Load active alerts
        const { data: alerts } = await supabaseAdmin
          .from("part_alerts")
          .select("id,user_id,keyword,brand,model,oem_code,category")
          .eq("is_active", true);

        const titleLc = (part.title ?? "").toLowerCase();
        const brandLc = (part.brand ?? "").toLowerCase();
        const modelLc = (part.model ?? "").toLowerCase();
        const oems = new Set<string>([
          ...(part.oem_codes ?? []),
          ...(part.oem_code ? [part.oem_code] : []),
        ].map((s: string) => (s ?? "").toUpperCase()).filter(Boolean));

        const matches = (alerts ?? []).filter((a: any) => {
          // Don't notify seller about their own listing
          if (a.user_id === part.seller_id) return false;
          // Brand/model filters narrow the match if set
          if (a.brand && !brandLc.includes(a.brand.toLowerCase())) return false;
          if (a.model && !modelLc.includes(a.model.toLowerCase())) return false;
          if (a.category && (part.category ?? "").toLowerCase() !== a.category.toLowerCase()) return false;

          let signal = false;
          if (a.oem_code && oems.has(a.oem_code.toUpperCase())) signal = true;
          if (!signal && a.keyword) {
            const kw = a.keyword.toLowerCase();
            if (titleLc.includes(kw) || brandLc.includes(kw) || modelLc.includes(kw)) signal = true;
          }
          // If only brand/model were set (no keyword/oem) and they matched above, count as signal
          if (!signal && !a.keyword && !a.oem_code && (a.brand || a.model)) signal = true;
          return signal;
        });

        if (matches.length === 0) return Response.json({ matched: 0, sent: 0 });

        // Load VAPID
        const { data: secrets } = await supabaseAdmin
          .from("app_secrets").select("key,value")
          .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
        const smap = new Map((secrets ?? []).map((r) => [r.key, r.value as string]));
        const pub = smap.get("vapid_public_key");
        const priv = smap.get("vapid_private_key");
        const subject = smap.get("vapid_subject") ?? "mailto:admin@tasitsan.com.tr";
        if (!pub || !priv) return new Response("VAPID not configured", { status: 500 });
        webpush.setVapidDetails(subject, pub, priv);

        const userIds = Array.from(new Set(matches.map((m: any) => m.user_id as string)));
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth_key,user_id")
          .in("user_id", userIds);

        const titleText = `Aradığınız parça sisteme eklendi: ${[part.brand, part.model, part.title].filter(Boolean).join(" ")}`.slice(0, 140);
        const stale: string[] = [];
        let sent = 0;
        await Promise.all((subs ?? []).map(async (s) => {
          if (!s.endpoint || !s.p256dh || !s.auth_key) return;
          const payload = JSON.stringify({
            title: "Parça Alarmı",
            body: titleText,
            url: `/parts/${part.id}`,
            tag: `alert-${part.id}`,
          });
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
              payload,
              { TTL: 3600 },
            );
            sent++;
          } catch (e: any) {
            const code = e?.statusCode ?? 0;
            if (code === 404 || code === 410) stale.push(s.id as string);
          }
        }));
        if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);

        // Mark alerts as matched
        const alertIds = matches.map((m: any) => m.id);
        await supabaseAdmin
          .from("part_alerts")
          .update({ last_matched_at: new Date().toISOString() })
          .in("id", alertIds);
        // increment match_count individually (small N)
        await Promise.all(
          matches.map((m: any) =>
            supabaseAdmin.from("part_alerts").update({ match_count: ((m.match_count ?? 0) as number) + 1 }).eq("id", m.id),
          ),
        );

        return Response.json({ matched: matches.length, sent });
      },
    },
  },
});

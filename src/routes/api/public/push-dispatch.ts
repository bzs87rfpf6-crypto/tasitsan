import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const provided = request.headers.get("x-push-secret") ?? "";
        const { data: secretRow } = await supabaseAdmin
          .from("app_secrets")
          .select("value")
          .eq("key", "push_dispatch_secret")
          .maybeSingle();
        const expected = (secretRow?.value ?? "") as string;
        if (!expected || provided.length === 0 || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { notification_id?: string } = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!body.notification_id) return new Response("Missing id", { status: 400 });

        // Load notification
        const { data: notif } = await supabaseAdmin
          .from("admin_notifications")
          .select("id, kind, priority, title, body, link, related_id")
          .eq("id", body.notification_id)
          .maybeSingle();
        if (!notif) return new Response("Not found", { status: 404 });

        // Load VAPID
        const { data: secrets } = await supabaseAdmin
          .from("app_secrets")
          .select("key,value")
          .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
        const map = new Map((secrets ?? []).map((r) => [r.key, r.value as string]));
        const pub = map.get("vapid_public_key");
        const priv = map.get("vapid_private_key");
        const subject = map.get("vapid_subject") ?? "mailto:admin@tasitsan.com.tr";
        if (!pub || !priv) return new Response("VAPID not configured", { status: 500 });
        webpush.setVapidDetails(subject, pub, priv);

        // Load admin subscriptions
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = (admins ?? []).map((r) => r.user_id as string);
        if (adminIds.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth_key,user_id")
          .in("user_id", adminIds);

        const payload = JSON.stringify({
          title: notif.title,
          body: notif.body ?? "",
          url: notif.link ?? "/admin",
          tag: `${notif.kind}-${notif.id}`,
          priority: notif.priority,
        });

        let sent = 0;
        let removed = 0;
        const stale: string[] = [];
        await Promise.all(
          (subs ?? []).map(async (s) => {
            if (!s.endpoint || !s.p256dh || !s.auth_key) return;
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
                payload,
                { TTL: 3600, urgency: notif.priority === "high" ? "high" : "normal" },
              );
              sent++;
            } catch (e: any) {
              const code = e?.statusCode ?? 0;
              if (code === 404 || code === 410) {
                stale.push(s.id as string);
                removed++;
              } else {
                console.error("[push-dispatch] send failed", code, e?.body ?? e?.message);
              }
            }
          }),
        );
        if (stale.length > 0) {
          await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
        }
        return new Response(JSON.stringify({ sent, removed }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

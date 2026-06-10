import { translateError } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push.functions";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSubscribeButton() {
  const [state, setState] = useState<"idle" | "checking" | "on" | "off" | "unsupported">("checking");
  const [busy, setBusy] = useState(false);
  const fnGetKey = useServerFn(getVapidPublicKey);
  const fnSub = useServerFn(subscribePush);
  const fnUnsub = useServerFn(unsubscribePush);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Bildirim izni reddedildi.");
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { key } = await fnGetKey();
      if (!key) {
        toast.error("VAPID anahtarı alınamadı.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
      });
      const json: any = sub.toJSON();
      await fnSub({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          user_agent: navigator.userAgent.slice(0, 500),
        },
      });
      setState("on");
      toast.success("Push bildirimleri açıldı.");
    } catch (e: any) {
      console.error("[push] enable failed", e);
      toast.error(translateError(e, "Abone olunamadı."));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fnUnsub({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Push bildirimleri kapatıldı.");
    } catch (e: any) {
      toast.error(translateError(e, "Kapatılamadı."));
    } finally {
      setBusy(false);
    }
  };

  if (state === "unsupported") {
    return (
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <BellOff className="size-3.5" /> Bu cihaz push desteklemiyor
      </div>
    );
  }
  if (state === "checking") {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Kontrol ediliyor
      </Button>
    );
  }
  if (state === "on") {
    return (
      <Button variant="outline" size="sm" onClick={disable} disabled={busy}>
        <Bell className="size-3.5 mr-1.5 text-emerald-400" />
        {busy ? "Kapatılıyor..." : "Push açık — kapat"}
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={enable} disabled={busy} className="bg-gold-gradient text-gold-foreground">
      <Bell className="size-3.5 mr-1.5" />
      {busy ? "Etkinleştiriliyor..." : "Push bildirimlerini aç"}
    </Button>
  );
}

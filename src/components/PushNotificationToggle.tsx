import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { savePushSubscription, deletePushSubscription } from "@/lib/push.functions";
import { toast } from "sonner";

/**
 * Push bildirim toggle iskeletti. Tarayıcı Notification API üzerinden izin alır,
 * abonelik kaydını DB'ye yazar. Gerçek gönderim sağlayıcısı henüz bağlı değil.
 *
 * Not: Service Worker olmadığı için tam Web Push abonelik objesi alınamaz.
 * Şimdilik bir "kayıt fişi" yazıyoruz; sağlayıcı eklenince burada
 * `registration.pushManager.subscribe(...)` çağrısı eklenecek.
 */
export function PushNotificationToggle() {
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(deletePushSubscription);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Bu tarayıcı push bildirim desteklemiyor.
      </p>
    );
  }

  const pseudoEndpoint = () => `local://${navigator.userAgent.slice(0, 64)}`;

  const enable = async () => {
    setLoading(true);
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") {
        toast.error("Bildirim izni verilmedi");
        return;
      }
      await save({
        data: {
          endpoint: pseudoEndpoint(),
          platform: "web",
          user_agent: navigator.userAgent.slice(0, 512),
        },
      });
      toast.success("Bildirimler açıldı");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    try {
      await remove({ data: { endpoint: pseudoEndpoint() } });
      toast.success("Bildirimler kapatıldı");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const active = permission === "granted";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-3">
        {active ? (
          <Bell className="size-5 text-gold" />
        ) : (
          <BellOff className="size-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Push Bildirim</p>
          <p className="text-xs text-muted-foreground">
            Talep ve teklif güncellemeleri için bildirim al
          </p>
        </div>
      </div>
      {active ? (
        <Button size="sm" variant="outline" disabled={loading} onClick={disable}>
          Kapat
        </Button>
      ) : (
        <Button size="sm" disabled={loading} onClick={enable}>
          Aç
        </Button>
      )}
    </div>
  );
}

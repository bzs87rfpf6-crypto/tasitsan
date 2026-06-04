import { PushSubscribeButton } from "@/components/admin/PushSubscribeButton";
import { Bell } from "lucide-react";

export function PushNotificationToggle() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-3">
        <Bell className="size-5 text-gold" />
        <div>
          <p className="text-sm font-medium">Push Bildirim</p>
          <p className="text-xs text-muted-foreground">
            Yeni talep, teklif ve admin bildirimleri için anlık push al.
          </p>
        </div>
      </div>
      <PushSubscribeButton />
    </div>
  );
}

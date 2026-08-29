import { useEffect, useState } from "react";
import { BellRing, Send, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PushSubscribeButton } from "@/components/admin/PushSubscribeButton";
import { sendTestAdminPush } from "@/lib/push.functions";
import { translateError } from "@/lib/error-messages";

/** iOS'ta Web Push yalnızca Ana Ekran'a eklenmiş (standalone) PWA'da çalışır. */
function useIosNeedsInstall() {
  const [needs, setNeeds] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setNeeds(Boolean(isIos && !standalone));
  }, []);
  return needs;
}

/** Yönetici: müşteri mesajı push bildirimlerini aç/kapat + test gönder. */
export function ChatPushPanel({ compact = false }: { compact?: boolean }) {
  const iosNeedsInstall = useIosNeedsInstall();
  const [testing, setTesting] = useState(false);
  const test = useServerFn(sendTestAdminPush);

  const runTest = async () => {
    setTesting(true);
    try {
      await test({ data: undefined as never });
      toast.success("Test bildirimi gönderildi. Cihazında birkaç saniye içinde görünmeli.");
    } catch (e) {
      toast.error(translateError(e, "Test bildirimi gönderilemedi."));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card/50 ${compact ? "p-2.5" : "p-3"} space-y-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BellRing className="size-4 text-gold shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">Müşteri mesaj bildirimleri</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Site kapalıyken bile yeni canlı sohbet mesajlarında telefonuna bildirim gelir.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PushSubscribeButton />
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-gold disabled:opacity-50"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Test
          </button>
        </div>
      </div>

      {iosNeedsInstall && (
        <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-[11px] leading-snug">
          <Smartphone className="size-3.5 text-gold mt-0.5 shrink-0" />
          <span>
            iPhone/iPad'de bildirim alabilmek için önce Safari'de <b>Paylaş → Ana Ekrana Ekle</b> ile uygulamayı
            yükle, sonra Ana Ekran'daki Taşıtsan simgesinden açıp bu düğmeyle bildirimleri aç.
          </span>
        </div>
      )}
    </div>
  );
}

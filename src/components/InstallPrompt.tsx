import { useEffect, useState } from "react";
import { Download, Share, X, PlusSquare, Chrome, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "tasitsan_a2hs_dismissed_at";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(DISMISS_KEY);
  if (!v) return false;
  const ts = Number(v);
  if (!ts) return false;
  return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : false;
  return (
    standaloneMedia ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS / iPadOS (tüm tarayıcılar; iPadOS 13+ Macintosh UA + touch dahil). */
function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return iOS || iPadOs;
}

/** iOS'ta Ana Ekrana Ekle yalnızca Safari'de var; diğer tarayıcılarda Safari'ye yönlendiriyoruz. */
function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return isIosDevice() && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [iosSafari, setIosSafari] = useState(true);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isCapacitorLike = Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) || /; wv[)]|\bwv\b|Capacitor/i.test(ua);
    if (isCapacitorLike) {
      return;
    }
    // Admin panelinde kendi kurulum kartı (AdminInstallCard) kullanılır.
    if (typeof location !== "undefined" && location.pathname.startsWith("/admin")) return;
    if (isStandalone() || recentlyDismissed()) return;


    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: hiçbir zaman beforeinstallprompt fırlatmaz, manuel ipucu göster
    if (isIosDevice()) {
      setIosSafari(isIosSafari());
      const t = setTimeout(() => setShowIos(true), 3000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
    setDeferred(null);
    setShowIos(false);
    setGuideOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIos) return null;

  return (
    <>
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] sm:bottom-20 inset-x-0 z-40 px-3 pointer-events-none">
        <div className="mx-auto max-w-sm sm:max-w-md pointer-events-auto rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 sm:p-3 shadow-md animate-in slide-in-from-bottom-4 fade-in">
          <div className="flex items-center gap-2.5">
            <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-gold-gradient flex items-center justify-center shrink-0">
              <Download className="size-4 sm:size-5 text-gold-foreground" />
            </div>
            <button
              type="button"
              onClick={deferred ? undefined : () => setGuideOpen(true)}
              className="flex-1 min-w-0 text-left"
              aria-label={deferred ? undefined : "Ana ekrana ekleme adımlarını göster"}
            >
              <p className="text-[13px] sm:text-sm font-semibold leading-tight">Taşıtsan'ı yükle</p>
              {deferred ? (
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                  Ana ekrana ekle, uygulama gibi kullan.
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 truncate">
                  Paylaş <Share className="size-3 inline" /> → "Ana Ekrana Ekle"
                </p>
              )}
            </button>
            {deferred ? (
              <Button size="sm" onClick={install} className="h-8 px-3 shrink-0">
                Yükle
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="h-8 px-3 shrink-0 bg-gold-gradient text-gold-foreground"
              >
                Nasıl?
              </Button>
            )}
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground p-1 shrink-0"
              aria-label="Kapat"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ana Ekrana Ekle</DialogTitle>
            <DialogDescription>
              Taşıtsan'ı uygulama gibi kullanmak ve bildirim alabilmek için 3 adım:
            </DialogDescription>
          </DialogHeader>

          {!iosSafari && (
            <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5 text-xs leading-snug">
              <Chrome className="size-4 text-gold mt-0.5 shrink-0" />
              <span>
                Şu an Safari kullanmıyorsun. iPhone/iPad'de Ana Ekrana Ekle yalnızca <b>Safari</b>'de
                çalışır. Bu sayfayı Safari'de aç, sonra aşağıdaki adımları izle.
              </span>
            </div>
          )}

          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <span className="size-6 shrink-0 rounded-full bg-gold-gradient text-gold-foreground text-xs font-bold grid place-items-center">1</span>
              <span className="flex-1">
                Safari'nin alt (veya üst) çubuğundaki <b>Paylaş</b> simgesine dokun.
                <Share className="size-4 inline ml-1 align-text-bottom text-gold" />
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="size-6 shrink-0 rounded-full bg-gold-gradient text-gold-foreground text-xs font-bold grid place-items-center">2</span>
              <span className="flex-1">
                Listede aşağı kaydır ve <b>Ana Ekrana Ekle</b>'yi seç.
                <PlusSquare className="size-4 inline ml-1 align-text-bottom text-gold" />
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="size-6 shrink-0 rounded-full bg-gold-gradient text-gold-foreground text-xs font-bold grid place-items-center">3</span>
              <span className="flex-1">
                <b>Ekle</b>'ye dokun, sonra Taşıtsan'ı ana ekrandaki simgeden aç.
              </span>
            </li>
          </ol>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="size-3.5 mt-0.5 shrink-0" />
            <span>
              iPhone'da bildirimler yalnızca ana ekrandan açılan uygulamada çalışır. Uygulamayı ana
              ekrandan açtıktan sonra <b>“Push bildirimlerini aç”</b> düğmesi görünür ve çalışır.
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={dismiss}>
              Bir daha gösterme
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setGuideOpen(false)}>
              Anladım
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

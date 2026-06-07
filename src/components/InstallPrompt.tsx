import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notChrome;
}

export function InstallPrompt() {
  console.log("[Taşıtsan Android Debug] InstallPrompt render");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if ((window as unknown as { Capacitor?: unknown }).Capacitor) {
      console.log("[Taşıtsan Android Debug] InstallPrompt skipped in Capacitor");
      return;
    }
    console.log("[Taşıtsan Android Debug] InstallPrompt useEffect start");
    if (isStandalone() || recentlyDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: hiçbir zaman beforeinstallprompt fırlatmaz, manuel ipucu göster
    if (isIosSafari()) {
      const t = setTimeout(() => setShowIos(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferred(null);
    setShowIos(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIos) return null;

  return (
    <div className="fixed bottom-20 inset-x-0 z-40 px-3 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-border bg-card/95 backdrop-blur p-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-gold-gradient flex items-center justify-center shrink-0">
            <Download className="size-5 text-gold-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Taşıtsan'ı yükle</p>
            {deferred ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Ana ekrana ekle, uygulama gibi kullan.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                Paylaş <Share className="size-3 inline" /> → "Ana Ekrana Ekle"
              </p>
            )}
            {deferred && (
              <Button size="sm" onClick={install} className="mt-2 h-8">
                Yükle
              </Button>
            )}
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

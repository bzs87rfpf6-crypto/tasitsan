import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, ShieldCheck, Chrome, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PushSubscribeButton } from "@/components/admin/PushSubscribeButton";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const ADMIN_MANIFEST = "/admin-manifest.webmanifest";
const ADMIN_APPLE_ICON = "/admin-apple-touch-icon.png";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : false;
  return media || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIosDevice() && /WebKit/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
}

/**
 * Admin PWA kurulumu: yönetim paneline ait ayrı manifest/ikon/start_url ile
 * ana ekrana eklenebilir kısayol. Müşteri PWA'sı (manifest.json) etkilenmez —
 * manifest bağlantısı yalnızca bu bileşen ekrandayken geçici olarak değişir.
 */
export function AdminInstallCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [safari, setSafari] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // Manifest'i admin sürümüyle değiştir; bileşen kaldırılınca eski haline dön.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const prevManifest = manifestLink?.getAttribute("href") ?? null;
    const prevApple = appleLink?.getAttribute("href") ?? null;

    let createdManifest: HTMLLinkElement | null = null;
    if (manifestLink) manifestLink.setAttribute("href", ADMIN_MANIFEST);
    else {
      createdManifest = document.createElement("link");
      createdManifest.rel = "manifest";
      createdManifest.href = ADMIN_MANIFEST;
      document.head.appendChild(createdManifest);
    }
    if (appleLink) appleLink.setAttribute("href", ADMIN_APPLE_ICON);

    const title = document.createElement("meta");
    title.name = "apple-mobile-web-app-title";
    title.content = "Taşıtsan Yönetim";
    document.head.appendChild(title);

    return () => {
      if (manifestLink && prevManifest) manifestLink.setAttribute("href", prevManifest);
      if (createdManifest) createdManifest.remove();
      if (appleLink && prevApple) appleLink.setAttribute("href", prevApple);
      title.remove();
    };
  }, []);

  useEffect(() => {
    setIos(isIosDevice());
    setSafari(isIosSafari());
    setInstalled(isStandalone());
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) { setGuideOpen(true); return; }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="rounded-xl border border-gold/40 bg-card/60 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="size-9 rounded-lg bg-gold-gradient grid place-items-center shrink-0">
            <ShieldCheck className="size-5 text-gold-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Yönetim Uygulamasını Yükle</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Ana ekrandaki ikon doğrudan yönetim paneline açılır. Giriş ve yetki kontrolü aynen geçerlidir.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {installed ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Kurulu
            </span>
          ) : (
            <Button size="sm" onClick={() => void install()} className="bg-gold-gradient text-gold-foreground">
              <Download className="size-3.5 mr-1.5" />
              {deferred ? "Ana Ekrana Ekle" : ios ? "Nasıl eklerim?" : "Kurulum adımları"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2">
        <p className="text-[11px] text-muted-foreground leading-snug max-w-[60%] min-w-[180px]">
          Canlı sohbet push bildirimi — site kapalıyken bile yeni müşteri mesajlarında bildirim al.
        </p>
        <PushSubscribeButton />
      </div>

      {ios && !installed && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          iPhone'da bildirimler yalnızca ana ekrana eklenmiş uygulamada çalışır.
        </p>
      )}

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Admin Panelini Ana Ekrana Ekle</DialogTitle>
            <DialogDescription>
              Yönetim panelini ayrı bir uygulama gibi açmak için adımlar:
            </DialogDescription>
          </DialogHeader>

          {ios && !safari && (
            <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5 text-xs leading-snug">
              <Chrome className="size-4 text-gold mt-0.5 shrink-0" />
              <span>iPhone/iPad'de Ana Ekrana Ekle yalnızca <b>Safari</b>'de çalışır. Bu sayfayı Safari'de aç.</span>
            </div>
          )}

          <ol className="space-y-3 text-sm">
            {(ios
              ? [
                  <>Safari çubuğundaki <b>Paylaş</b> simgesine dokun. <Share className="size-4 inline ml-1 align-text-bottom text-gold" /></>,
                  <>Listeden <b>Ana Ekrana Ekle</b>'yi seç. <PlusSquare className="size-4 inline ml-1 align-text-bottom text-gold" /></>,
                  <><b>Ekle</b>'ye dokun; ikon doğrudan yönetim paneline açılır.</>,
                ]
              : [
                  <>Tarayıcı adres çubuğundaki <b>Yükle</b> simgesine tıkla.</>,
                  <>Menüden <b>Uygulamayı yükle / Kısayol oluştur</b> seçeneğini kullan.</>,
                  <>Kurulan uygulama doğrudan yönetim paneline açılır.</>,
                ]
            ).map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="size-6 shrink-0 rounded-full bg-gold-gradient text-gold-foreground text-xs font-bold grid place-items-center">{i + 1}</span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="size-3.5 mt-0.5 shrink-0" />
            <span>
              Uygulama giriş bilgilerini paylaşır; yönetici yetkisi olmayan hesapla açıldığında panel yine erişime kapalıdır.
            </span>
          </div>

          <Button size="sm" onClick={() => setGuideOpen(false)}>Anladım</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

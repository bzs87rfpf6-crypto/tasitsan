import { useEffect, useState } from "react";
import emblem from "@/assets/tasitsan-emblem.png.asset.json";

/**
 * Açılış ekranı. Sadece PWA standalone modunda veya ilk yüklemede gösterilir.
 * Sayfa içinde geçişlerde tetiklenmez.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Sadece standalone (ana ekrana eklenmiş) veya sessionda ilk açılışta göster
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const shown = sessionStorage.getItem("tasitsan_splash_shown");
    if (!isStandalone && shown) return;

    setVisible(true);
    sessionStorage.setItem("tasitsan_splash_shown", "1");

    const leaveTimer = setTimeout(() => setLeaving(true), 900);
    const hideTimer = setTimeout(() => setVisible(false), 1400);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
        <img
          src={emblem.url}
          alt=""
          width={120}
          height={120}
          className="size-28 drop-shadow-[0_0_30px_rgba(212,160,23,0.35)]"
        />
        <div className="text-center">
          <h1 className="font-display text-2xl text-gold tracking-wide">Taşıtsan</h1>
          <p className="mt-1 text-xs text-muted-foreground">Parça Borsası</p>
        </div>
        <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full origin-left animate-[splash-bar_900ms_ease-out_forwards] bg-gold-gradient" />
        </div>
      </div>
      <style>{`
        @keyframes splash-bar {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from "react";

const EMBLEM_URL = "/icon-192.png";

/**
 * Açılış ekranı. Sadece PWA standalone modunda veya ilk yüklemede gösterilir.
 *
 * Önemli: Eski WebView'lerde (Huawei EMUI 10.1 / Chrome <111) oklch renkleri
 * desteklenmediği için tema değişkenleri çözümlenemiyor ve uygulama tamamen
 * siyah kalabiliyor. Bu yüzden splash'i:
 *   - Sabit hex renklerle çiziyoruz (CSS değişkenlerine bağımlı değil).
 *   - Vite/asset import zincirine bağımlı olmayan public ikonunu kullanıyoruz.
 *   - Her durumda en fazla 1500ms sonra GARANTİ olarak kaldırıyoruz
 *     (state hatası, animasyon takılması, vs. olsa bile).
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let shouldShow = false;
    try {
      const standaloneMedia = typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)").matches
        : false;
      const isStandalone = standaloneMedia || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const shown = sessionStorage.getItem("tasitsan_splash_shown");
      shouldShow = isStandalone || !shown;
      if (shouldShow) sessionStorage.setItem("tasitsan_splash_shown", "1");
    } catch {
      // sessionStorage / matchMedia eski WebView'de patlayabilir — splash atla
      shouldShow = false;
    }

    if (!shouldShow) return;

    setVisible(true);
    const leaveTimer = setTimeout(() => setLeaving(true), 900);
    const hideTimer = setTimeout(() => setVisible(false), 1500);
    // Son güvenlik ağı: animasyon/JS hatası olsa bile 3sn'de mutlaka kapat.
    const failsafe = setTimeout(() => setVisible(false), 3000);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(hideTimer);
      clearTimeout(failsafe);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#121212",
        color: "#f5f2eb",
        opacity: leaving ? 0 : 1,
        transition: "opacity 500ms ease",
      }}
      aria-hidden="true"
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
        <img
          src={EMBLEM_URL}
          alt=""
          width={120}
          height={120}
          style={{ width: 112, height: 112, filter: "drop-shadow(0 0 30px rgba(212,160,23,0.35))" }}
        />
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "Bebas Neue, Impact, sans-serif", fontSize: "1.5rem", color: "#d4a017", letterSpacing: "0.04em", margin: 0 }}>
            Taşıtsan
          </h1>
          <p style={{ marginTop: 4, fontSize: "0.75rem", color: "#aaa292" }}>Parça Borsası</p>
        </div>
        <div style={{ marginTop: 8, height: 4, width: 96, overflow: "hidden", borderRadius: 999, backgroundColor: "#1d1a16" }}>
          <div
            style={{
              height: "100%",
              width: "100%",
              transformOrigin: "left",
              backgroundImage: "linear-gradient(135deg, #e6b53a, #b8861a)",
              animation: "splash-bar 900ms ease-out forwards",
            }}
          />
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

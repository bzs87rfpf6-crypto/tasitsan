import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

const STORAGE_KEY = "ts:announce:dismissed_until";

const MESSAGES = [
  {
    emoji: "💰",
    title: "Uygun Fiyatlı Yedek Parçalar",
    text: "Atıl stoklar sayesinde avantajlı fiyatlarla alışveriş yapın.",
  },
  {
    emoji: "🔒",
    title: "Güvenilir Satıcılarla Alışveriş",
    text: "Gerçek satıcılar ve doğrulanmış ilanlarla güvenle alışveriş yapın.",
  },
  {
    emoji: "🚀",
    title: "Büyük Güncelleme Yakında",
    text: "145.000+ yeni stok sisteme ekleniyor.",
  },
  {
    emoji: "🎁",
    title: "Ücretsiz Üyelik",
    text: "Ücretsiz üye olun, ücretsiz ilan verin ve binlerce alıcıya ulaşın.",
  },
];

export function AnnouncementBar() {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (!until || Date.now() > until) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 5000);
    return () => clearInterval(t);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch { /* ignore */ }
    setVisible(false);
  };

  const m = MESSAGES[idx];

  return (
    <div
      role="region"
      aria-label="Duyuru"
      className="relative w-full bg-gradient-to-r from-[#0a0a0a] via-[#14110e] to-[#0a0a0a] border-b border-gold/40 shadow-gold"
    >
      <div className="max-w-6xl mx-auto pl-3 pr-9 sm:px-6 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
        <div
          key={idx}
          className="flex-1 min-w-0 flex items-start sm:items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-1 duration-500"
        >
          <span className="text-base sm:text-xl shrink-0 leading-tight" aria-hidden>{m.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] sm:text-sm font-bold text-gold leading-tight">
              {m.title}
            </p>
            <p className="text-[10.5px] sm:text-xs text-white/75 leading-snug">
              {m.text}
            </p>
          </div>
        </div>

        <Link
          to="/auth" rel="nofollow"
          onClick={() => {
            try { localStorage.setItem("ts:cta_source", "announcement_bar"); } catch { /* ignore */ }
          }}
          className="tap-gold self-stretch sm:self-auto shrink-0 inline-flex items-center justify-center h-9 sm:h-9 px-3 sm:px-5 rounded-full bg-gold-gradient text-gold-foreground font-extrabold text-[11px] sm:text-xs uppercase tracking-wider shadow-gold whitespace-nowrap animate-gold-pulse-border border-2 border-transparent hover:brightness-110 active:scale-[0.97] transition"
        >
          🎁 Ücretsiz Üye Ol
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Duyuruyu kapat"
          className="absolute right-1 top-1 sm:top-1/2 sm:-translate-y-1/2 size-7 grid place-items-center rounded-full text-white/60 hover:text-gold hover:bg-white/5 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* indicator dots */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 hidden sm:flex gap-1">
        {MESSAGES.map((_, i) => (
          <span
            key={i}
            className={`block h-0.5 rounded-full transition-all ${i === idx ? "w-4 bg-gold" : "w-1.5 bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}

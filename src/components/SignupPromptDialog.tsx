import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional override, defaults to the standard CTA copy. */
  title?: string;
  /** Telemetry / cta_source label. */
  source?: string;
}

const BENEFITS = [
  "Ücretsiz ilan verin",
  "Uygun fiyatlı binlerce parçaya ulaşın",
  "Güvenilir satıcılarla iletişim kurun",
  "Yakında eklenecek 145.000+ yeni stoktan ilk siz haberdar olun",
];

export function SignupPromptDialog({ open, onOpenChange, title = "Ücretsiz Üye Olun", source = "signup_prompt" }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-prompt-title"
      className="fixed inset-0 z-[100] grid place-items-center p-4 animate-in fade-in duration-200"
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm bg-card border-2 border-gold/60 rounded-3xl shadow-gold overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="absolute inset-x-0 top-0 h-1 bg-gold-gradient" />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Kapat"
          className="absolute right-2 top-2 size-9 grid place-items-center rounded-full text-muted-foreground hover:text-gold hover:bg-gold/10 transition"
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-7 pb-6 space-y-5 text-center">
          <div className="mx-auto size-14 rounded-2xl bg-gold/15 grid place-items-center text-gold">
            <Sparkles className="size-7" />
          </div>

          <div className="space-y-1.5">
            <h2 id="signup-prompt-title" className="font-display text-2xl text-gold tracking-wide">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              Saniyeler içinde ücretsiz hesabınızı oluşturun.
            </p>
          </div>

          <ul className="text-left space-y-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 size-5 shrink-0 rounded-full bg-gold/15 text-gold grid place-items-center font-bold text-[12px]">
                  ✓
                </span>
                <span className="text-foreground/90 leading-snug">{b}</span>
              </li>
            ))}
          </ul>

          <Link
            to="/auth" rel="nofollow"
            onClick={() => {
              try { localStorage.setItem("ts:cta_source", source); } catch { /* ignore */ }
              onOpenChange(false);
            }}
            className="tap-gold block w-full h-14 rounded-2xl bg-gold-gradient text-gold-foreground font-extrabold text-base uppercase tracking-wider shadow-gold animate-gold-pulse-border border-2 border-transparent hover:brightness-110 active:scale-[0.98] transition leading-[3.5rem]"
          >
            🎁 Ücretsiz Üye Ol
          </Link>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground py-1"
          >
            Daha sonra
          </button>
        </div>
      </div>
    </div>
  );
}

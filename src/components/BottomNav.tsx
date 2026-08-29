import { Link, useLocation } from "@tanstack/react-router";
import { Search, PlusSquare, Inbox, User, Flame } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SignupPromptDialog } from "@/components/SignupPromptDialog";

const items = [
  { to: "/", label: "Ara", icon: Search, badge: null as string | null },
  { to: "/sell", label: "Sat", icon: PlusSquare, badge: "Ücretsiz" },
  { to: "/firsatlar", label: "Fırsatlar", icon: Flame, badge: "Yeni" },
  { to: "/requests", label: "Talep Merkezi", icon: Inbox, badge: null },
  { to: "/account", label: "Hesap", icon: User, badge: null },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl safe-bottom"
      >
        <ul className="grid grid-cols-5 max-w-2xl mx-auto">
          {items.map(({ to, label, icon: Icon, badge }) => {
            const active = pathname === to;
            const isSell = to === "/sell";
            const handleSellClick = (e: React.MouseEvent) => {
              if (isSell && !user) {
                e.preventDefault();
                setPromptOpen(true);
              }
            };
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={isSell ? handleSellClick : undefined}
                  className={`group relative flex flex-col items-center gap-1 py-2.5 text-xs transition-colors duration-150 select-none touch-manipulation active:scale-[0.94] ${
                    active ? "text-gold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className={`relative flex items-center justify-center size-10 rounded-full transition-all duration-200 ${
                      active ? "bg-gold/15 shadow-[inset_0_0_0_1px_rgba(212,160,23,0.35)]" : ""
                    }`}
                  >
                    <Icon className={`size-6 transition-transform duration-200 ${active ? "scale-110 stroke-[2.5]" : ""}`} />
                    {badge && (
                      <span className="absolute -top-1.5 -right-3 px-1.5 h-[15px] rounded-full bg-gold-gradient text-gold-foreground text-[9px] font-extrabold uppercase tracking-wide shadow-gold leading-[15px] whitespace-nowrap border border-background">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className={`leading-none ${active ? "font-bold" : "font-medium"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SignupPromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title="İlan vermek için üye olun"
        source="bottom_nav_sell"
      />
    </>
  );
}

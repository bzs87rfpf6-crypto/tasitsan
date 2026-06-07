import { Link, useLocation } from "@tanstack/react-router";
import { Search, PlusSquare, Inbox, User } from "lucide-react";

const items = [
  { to: "/", label: "Ara", icon: Search },
  { to: "/sell", label: "Sat", icon: PlusSquare },
  { to: "/requests", label: "Talep Merkezi", icon: Inbox },
  { to: "/account", label: "Hesap", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl safe-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4 max-w-2xl mx-auto">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className={`group relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors duration-150 select-none touch-manipulation active:scale-[0.94] ${
                  active ? "text-gold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`flex items-center justify-center size-9 rounded-full transition-all duration-200 ${
                    active ? "bg-gold/15 shadow-[inset_0_0_0_1px_rgba(212,160,23,0.35)]" : ""
                  }`}
                >
                  <Icon className={`size-5 transition-transform duration-200 ${active ? "scale-110 stroke-[2.5]" : ""}`} />
                </span>
                <span className={`font-medium leading-none ${active ? "font-semibold" : ""}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

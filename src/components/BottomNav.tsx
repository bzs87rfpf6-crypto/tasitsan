import { Link, useLocation } from "@tanstack/react-router";
import { Search, PlusSquare, Inbox, User } from "lucide-react";

const items = [
  { to: "/", label: "Ara", icon: Search },
  { to: "/sell", label: "Sat", icon: PlusSquare },
  { to: "/requests", label: "Talepler", icon: Inbox },
  { to: "/account", label: "Hesap", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur safe-bottom">
      <ul className="grid grid-cols-4 max-w-md mx-auto">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
                  active ? "text-gold" : "text-muted-foreground"
                }`}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

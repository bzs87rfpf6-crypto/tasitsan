import { Link } from "@tanstack/react-router";
import { ShieldCheck, MessageCircle, ChevronRight } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";

/**
 * Yalnızca gerçek admin/super_admin rolüne sahip kullanıcıya görünen
 * yönetim paneli kısayolu. Normal müşteriler için hiçbir şey render edilmez.
 */
export function AdminQuickAccess({ compact = false }: { compact?: boolean }) {
  const { isAdmin } = useIsAdmin();
  if (!isAdmin) return null;

  return (
    <div className={`rounded-xl border border-gold/50 bg-gold/5 ${compact ? "p-2.5" : "p-3"} space-y-2`}>
      <Link
        to="/admin"
        className="flex items-center gap-3 rounded-lg bg-gold-gradient px-3 py-2.5 text-gold-foreground"
      >
        <ShieldCheck className="size-5 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold leading-tight">Admin Paneli</span>
          <span className="block text-[11px] opacity-80 leading-tight">Yönetim, siparişler ve raporlar</span>
        </span>
        <ChevronRight className="size-4 shrink-0" />
      </Link>
      <Link
        to="/admin/live-support"
        className="flex items-center gap-2 rounded-lg border border-gold/40 px-3 py-2 text-sm font-medium text-gold hover:bg-gold/10"
      >
        <MessageCircle className="size-4 shrink-0" />
        <span className="flex-1">Canlı Sohbet</span>
        <ChevronRight className="size-4 shrink-0" />
      </Link>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { StarRating } from "@/components/trust/StarRating";
import { adminListReviews, adminSetReviewStatus } from "@/lib/trust.functions";
import { Eye, EyeOff } from "lucide-react";

interface Review {
  id: string; seller_id: string; buyer_id: string; part_id: string;
  rating: number; title: string | null; comment: string | null; status: string;
  helpful_count: number; verified_purchase: boolean; created_at: string;
}
interface Report { id: string; review_id: string; reporter_id: string; reason: string; status: string; created_at: string; }

export function ReviewsAdminPanel() {
  const list = useServerFn(adminListReviews);
  const setStatus = useServerFn(adminSetReviewStatus);
  const [scope, setScope] = useState<"all" | "reported" | "hidden">("all");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await list({ data: { scope } });
      setReviews(res.reviews as unknown as Review[]);
      setReports(res.reports as unknown as Report[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope]);

  const reportedIds = new Set(reports.map((r) => r.review_id));
  const shown = scope === "reported" ? reviews.filter((r) => reportedIds.has(r.id)) : reviews;

  async function toggle(r: Review) {
    try {
      await setStatus({ data: { reviewId: r.id, status: r.status === "hidden" ? "visible" : "hidden" } });
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["all", "reported", "hidden"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border ${scope === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"}`}>
            {s === "all" ? "Tümü" : s === "reported" ? `Şikayet (${reports.length})` : "Gizlenenler"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Yükleniyor…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Kayıt yok.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="border border-border rounded-lg p-3 bg-card space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRating value={r.rating} size={12} />
                  <span className="text-[10px] font-mono text-muted-foreground">{r.id.slice(0, 8)}</span>
                  {r.verified_purchase && <span className="text-[10px] text-sky-400">✓ Doğrulanmış</span>}
                  {r.status === "hidden" && <span className="text-[10px] text-destructive">Gizli</span>}
                </div>
                <button onClick={() => toggle(r)} className="text-xs inline-flex items-center gap-1 text-gold">
                  {r.status === "hidden" ? <><Eye className="size-3" /> Göster</> : <><EyeOff className="size-3" /> Gizle</>}
                </button>
              </div>
              {r.title && <p className="text-sm font-semibold">{r.title}</p>}
              {r.comment && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.comment}</p>}
              {reportedIds.has(r.id) && (
                <div className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1">
                  {reports.filter((x) => x.review_id === r.id).map((x) => x.reason).join(" • ")}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                Satıcı: {r.seller_id.slice(0, 8)} • Alıcı: {r.buyer_id.slice(0, 8)} • {new Date(r.created_at).toLocaleString("tr-TR")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

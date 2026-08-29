import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, RotateCcw, EyeOff, Eye, AlertTriangle, Search, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminListModeration,
  adminModerateRecord,
  adminModerationStats,
} from "@/lib/admin-moderation.functions";
import { RecordEditDialog, RecordViewDialog } from "@/components/admin/RecordEditDialog";

type Scope = "requests" | "quotes";
type Visibility = "active" | "passive" | "deleted";
type Action = "delete" | "restore" | "deactivate" | "activate" | "hard_delete";

type Stats = {
  requests: { active: number; passive: number; deleted: number; total: number };
  quotes: { active: number; passive: number; deleted: number; total: number };
};

const ACTION_LABEL: Record<Action, string> = {
  delete: "Sil (yumuşak)",
  restore: "Geri al",
  deactivate: "Pasife al",
  activate: "Aktifleştir",
  hard_delete: "Kalıcı sil",
};

const ACTION_CONFIRM: Record<Action, { title: string; desc: string }> = {
  delete: {
    title: "Kaydı silmek istediğinize emin misiniz?",
    desc: "Kayıt silinmiş olarak işaretlenecek ve kullanıcılar tarafından görüntülenemeyecek. İşlem loglanır ve daha sonra geri alınabilir.",
  },
  hard_delete: {
    title: "Kaydı KALICI olarak silmek istiyor musunuz?",
    desc: "Bu işlem geri alınamaz. Kayıt veritabanından tamamen silinecektir.",
  },
  deactivate: {
    title: "Kaydı pasife almak istediğinize emin misiniz?",
    desc: "Pasif kayıtlar ziyaretçilere ve diğer kullanıcılara görünmez. Yöneticiler görmeye devam eder.",
  },
  activate: { title: "Aktifleştir?", desc: "Kayıt yeniden görünür hale gelecek." },
  restore: { title: "Geri al?", desc: "Silinmiş kayıt geri yüklenecek ve aktif hale gelecek." },
};

export function ModerationPanel() {
  const listFn = useServerFn(adminListModeration);
  const moderateFn = useServerFn(adminModerateRecord);
  const statsFn = useServerFn(adminModerationStats);

  const [scope, setScope] = useState<Scope>("requests");
  const [visibility, setVisibility] = useState<Visibility>("active");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: Action } | null>(null);
  const [viewRow, setViewRow] = useState<any | null>(null);
  const [editRow, setEditRow] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        listFn({ data: { scope, visibility, limit: 200, search: search || undefined } }),
        statsFn(),
      ]);
      setRows(list ?? []);
      setStats(st);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [listFn, statsFn, scope, visibility, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => (stats ? stats[scope] : null), [stats, scope]);

  async function performAction(id: string, action: Action) {
    setBusyId(id);
    try {
      await moderateFn({ data: { scope, id, action } });
      toast.success("İşlem tamamlandı");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  const visBtn = (v: Visibility, label: string, count?: number) => (
    <button
      key={v}
      onClick={() => setVisibility(v)}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        visibility === v
          ? "bg-gold-gradient text-gold-foreground border-transparent"
          : "border-border text-muted-foreground"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count.toLocaleString("tr-TR")})` : ""}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        {(["requests", "quotes"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${
              scope === s ? "border-gold text-gold" : "border-transparent text-muted-foreground"
            }`}
          >
            {s === "requests" ? "Talepler" : "Teklifler"}
            {stats ? ` · ${stats[s].total.toLocaleString("tr-TR")}` : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Aktif" value={counts?.active} tone="green" />
        <StatBox label="Pasif" value={counts?.passive} tone="amber" />
        <StatBox label="Silinmiş" value={counts?.deleted} tone="rose" />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {visBtn("active", "Aktif", counts?.active)}
        {visBtn("passive", "Pasif", counts?.passive)}
        {visBtn("deleted", "Silinmiş", counts?.deleted)}
      </div>

      {scope === "requests" && (
        <div className="relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: parça, OEM, marka, isim, telefon..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground p-4 flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Yükleniyor...
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6 text-center">Kayıt yok.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <RecordCard
              key={r.id}
              scope={scope}
              row={r}
              busy={busyId === r.id}
              onAction={(action) => setConfirm({ id: r.id, action })}
              onView={() => setViewRow(r)}
              onEdit={() => setEditRow(r)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirm?.action === "hard_delete" && (
                <AlertTriangle className="size-4 text-destructive" />
              )}
              {confirm ? ACTION_CONFIRM[confirm.action].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? ACTION_CONFIRM[confirm.action].desc : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && performAction(confirm.id, confirm.action)}
              className={
                confirm?.action === "hard_delete" || confirm?.action === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirm ? ACTION_LABEL[confirm.action] : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordViewDialog
        open={!!viewRow}
        onOpenChange={(o) => !o && setViewRow(null)}
        scope={scope}
        row={viewRow}
      />
      <RecordEditDialog
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        scope={scope}
        row={editRow}
        onSaved={load}
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: "green" | "amber" | "rose";
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
      : tone === "amber"
      ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
      : "bg-rose-500/10 border-rose-500/40 text-rose-300";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className="text-[10px] uppercase opacity-80">{label}</p>
      <p className="text-lg font-bold">{value?.toLocaleString("tr-TR") ?? "—"}</p>
    </div>
  );
}

function RecordCard({
  scope,
  row,
  busy,
  onAction,
  onView,
  onEdit,
}: {
  scope: Scope;
  row: any;
  busy: boolean;
  onAction: (a: Action) => void;
  onView: () => void;
  onEdit: () => void;
}) {
  const isDeleted = !!row.deleted_at;
  const isPassive = !isDeleted && row.is_active === false;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {scope === "requests" ? (
            <>
              <p className="font-semibold text-sm truncate">
                {row.part_name || row.brand || "—"}{" "}
                {row.brand && row.model ? `· ${row.brand} ${row.model}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {row.city ?? "—"} · {row.full_name ?? "—"} · {row.phone ?? "—"}
                {row.oem_code ? ` · OEM ${row.oem_code}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-sm">
                ₺{Number(row.price ?? 0).toLocaleString("tr-TR")}
                {row.delivery_time ? ` · ${row.delivery_time}` : ""}
                {row.condition ? ` · ${row.condition}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Talep: {String(row.request_id).slice(0, 8)} · Satıcı:{" "}
                {String(row.seller_id).slice(0, 8)}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(row.created_at).toLocaleString("tr-TR")}
            {isDeleted && row.deleted_at
              ? ` · silindi: ${new Date(row.deleted_at).toLocaleString("tr-TR")}`
              : ""}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isDeleted ? (
            <span className="text-[10px] text-rose-300 border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 rounded-full">
              Silinmiş
            </span>
          ) : isPassive ? (
            <span className="text-[10px] text-amber-300 border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 rounded-full">
              Pasif
            </span>
          ) : (
            <span className="text-[10px] text-emerald-300 border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              Aktif
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 pt-1">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className="h-7 text-[11px]"
          onClick={onView}
        >
          <Eye className="size-3 mr-1" /> Görüntüle
        </Button>
        {!isDeleted && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px]"
            onClick={onEdit}
          >
            <Pencil className="size-3 mr-1" /> Düzenle
          </Button>
        )}
        {!isDeleted && !isPassive && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px]"
            onClick={() => onAction("deactivate")}
          >
            <EyeOff className="size-3 mr-1" /> Pasife al
          </Button>
        )}
        {!isDeleted && isPassive && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px]"
            onClick={() => onAction("activate")}
          >
            <Eye className="size-3 mr-1" /> Aktifleştir
          </Button>
        )}
        {isDeleted && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px]"
            onClick={() => onAction("restore")}
          >
            <RotateCcw className="size-3 mr-1" /> Geri al
          </Button>
        )}
        {!isDeleted && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => onAction("delete")}
          >
            <Trash2 className="size-3 mr-1" /> Sil
          </Button>
        )}
        {isDeleted && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-[11px] border-destructive/60 text-destructive hover:bg-destructive/10"
            onClick={() => onAction("hard_delete")}
          >
            <AlertTriangle className="size-3 mr-1" /> Kalıcı sil
          </Button>
        )}
      </div>
    </div>
  );
}

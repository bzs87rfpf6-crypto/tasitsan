import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Virtuoso } from "react-virtuoso";
import { Pencil, Power, Trash2, Search, Eye, CheckCircle2, X } from "lucide-react";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import { bulkDeleteParts } from "@/lib/bulk-delete.functions";
import { deleteInChunks, formatDeleteResult } from "@/lib/bulk-delete";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmSaleDialog } from "@/components/trust/ConfirmSaleDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import { normalize } from "@/lib/search";
import { normalizeOem } from "@/lib/oem";
import { getMyListingViewCounts } from "@/lib/my-listings.functions";
import { Input } from "@/components/ui/input";
import { SafePartImage } from "@/components/SafePartImage";
import { buildPartParam } from "@/lib/part-slug";

export interface ManagerPart {
  id: string;
  seo_slug?: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  price: number | null;
  photos: string[] | null;
  status: string;
  stock_quantity: number | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  created_at: string;
  updated_at: string | null;
  is_sold?: boolean | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Onay Bekliyor", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  approved: { label: "Yayında", cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  inactive: { label: "Pasif", cls: "text-muted-foreground border-border bg-muted/30" },
  rejected: { label: "Reddedildi", cls: "text-destructive border-destructive/40 bg-destructive/10" },
};

type Filter = "all" | "active" | "sold" | "inactive" | "pending" | "rejected" | "in_stock" | "out_of_stock";
type Sort = "newest" | "oldest" | "price_asc" | "price_desc" | "views" | "updated";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "active", label: "Satışta" },
  { id: "sold", label: "Satıldı" },
  { id: "inactive", label: "Pasif" },
  { id: "pending", label: "Onay Bekleyen" },
  { id: "rejected", label: "Reddedilen" },
  { id: "in_stock", label: "Stokta Var" },
  { id: "out_of_stock", label: "Stokta Yok" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "En Yeni" },
  { id: "oldest", label: "En Eski" },
  { id: "price_asc", label: "Fiyat ↑" },
  { id: "price_desc", label: "Fiyat ↓" },
  { id: "views", label: "Görüntülenme" },
  { id: "updated", label: "Son Güncelleme" },
];

/** Strip spaces/dashes/dots from OEM strings for fuzzy matching. */
function oemCanon(s: string): string {
  return normalizeOem(s).replace(/[\s\-./]/g, "");
}

interface Props {
  userId: string;
  parts: ManagerPart[];
  onRefresh: () => void;
}

function MyListingsManagerImpl({ userId, parts, onRefresh }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [views, setViews] = useState<Record<string, number>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);
  const runBulkDelete = useServerFn(bulkDeleteParts);


  const fetchViews = useServerFn(getMyListingViewCounts);
  useEffect(() => {
    if (parts.length === 0) return;
    fetchViews({ data: undefined as never }).then(setViews).catch(() => { /* ignore */ });
  }, [fetchViews, parts.length]);

  // Pre-compute searchable blob for each part once.
  const indexed = useMemo(() => {
    return parts.map((p) => {
      const oemList = [p.oem_code, ...(p.oem_codes ?? [])].filter(Boolean) as string[];
      const text = normalize(
        [p.title, p.brand, p.model, p.category].filter(Boolean).join(" "),
      );
      const oemCanons = oemList.map(oemCanon);
      return { part: p, text, oemCanons };
    });
  }, [parts]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim();
    const qNorm = normalize(q);
    const qOem = oemCanon(q);
    const searching = qNorm.length > 0;

    const out: ManagerPart[] = [];
    for (const { part, text, oemCanons } of indexed) {
      // Status / stock filter
      switch (filter) {
        case "active": if (part.status !== "approved" || part.is_sold) continue; break;
        case "sold": if (!part.is_sold) continue; break;
        case "inactive": if (part.status !== "inactive") continue; break;
        case "pending": if (part.status !== "pending") continue; break;
        case "rejected": if (part.status !== "rejected") continue; break;
        case "in_stock": if ((part.stock_quantity ?? 0) <= 0) continue; break;
        case "out_of_stock": if ((part.stock_quantity ?? 0) > 0) continue; break;
      }
      // Search
      if (searching) {
        const hitText = qNorm.length > 0 && text.includes(qNorm);
        const hitOem = qOem.length >= 2 && oemCanons.some((c) => c.includes(qOem));
        if (!hitText && !hitOem) continue;
      }
      out.push(part);
    }

    // Sort
    const cmp = (a: ManagerPart, b: ManagerPart): number => {
      switch (sort) {
        case "newest": return +new Date(b.created_at) - +new Date(a.created_at);
        case "oldest": return +new Date(a.created_at) - +new Date(b.created_at);
        case "price_asc": return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "price_desc": return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "views": return (views[b.id] ?? 0) - (views[a.id] ?? 0);
        case "updated": {
          const av = a.updated_at ?? a.created_at;
          const bv = b.updated_at ?? b.created_at;
          return +new Date(bv) - +new Date(av);
        }
      }
    };
    out.sort(cmp);
    return out;
  }, [indexed, filter, sort, deferredQuery, views]);

  const togglePassive = async (p: ManagerPart) => {
    const next = p.status === "inactive" ? "pending" : "inactive";
    const { error } = await supabase.from("parts").update({ status: next }).eq("id", p.id).eq("seller_id", userId);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(next === "inactive" ? "İlan pasife alındı" : "İlan tekrar onaya gönderildi");
    onRefresh();
  };

  const toggleSold = async (p: ManagerPart) => {
    const next = !p.is_sold;
    const { error } = await supabase
      .from("parts")
      .update({ is_sold: next, sold_at: next ? new Date().toISOString() : null })
      .eq("id", p.id)
      .eq("seller_id", userId);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(next ? "İlan satıldı olarak işaretlendi" : "Satıldı işareti kaldırıldı");
    onRefresh();
  };

  const deletePart = async (p: ManagerPart) => {
    if (!confirm(`"${p.title}" ilanını silmek istediğine emin misin?`)) return;
    const { error } = await supabase.from("parts").delete().eq("id", p.id).eq("seller_id", userId);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("İlan silindi");
    onRefresh();
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const doBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ processed: 0, total: ids.length });
    try {
      const res = await deleteInChunks(
        (args) => runBulkDelete(args) as any,
        ids,
        (processed, total) => setBulkProgress({ processed, total }),
      );
      toast.success(formatDeleteResult(res));
      if (res.failed > 0) toast.warning(`${res.failed} ürün silinemedi (yetki veya kayıt bulunamadı).`);
      setSelected(new Set());
      setSelectMode(false);
      setConfirmBulk(false);
      onRefresh();
    } catch (e: any) {
      toast.error(translateError(e, "Toplu silme başarısız"));
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };



  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="OEM, ürün adı, marka, model, kategori ara..."
          className="h-11 pl-9 bg-background w-full"
          inputMode="search"
        />
      </div>

      {/* Filter chips — horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 h-8 px-3 rounded-full text-[11px] font-semibold border whitespace-nowrap transition ${
              filter === f.id
                ? "bg-gold-gradient text-gold-foreground border-transparent"
                : "bg-card border-border text-muted-foreground hover:border-gold"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sort + counter */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Toplam <span className="text-foreground font-semibold">{parts.length}</span> ilan içinde{" "}
          <span className="text-gold font-semibold">{filtered.length}</span> sonuç
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            className={`h-8 px-3 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 ${
              selectMode
                ? "border-border text-muted-foreground hover:border-gold"
                : "border-destructive/40 text-destructive hover:bg-destructive/10"
            }`}
          >
            {selectMode ? <><X className="size-3" /> Vazgeç</> : <><Trash2 className="size-3" /> Toplu Sil</>}
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 px-2 rounded-md bg-card border border-border text-[11px] font-semibold text-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Toplu seçim çubuğu */}
      {selectMode && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
          <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground cursor-pointer">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
            Tümünü Seç ({filtered.length.toLocaleString("tr-TR")})
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-destructive font-semibold">
              {selected.size.toLocaleString("tr-TR")} ürün seçildi
            </span>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setConfirmBulk(true)}
              className="h-8 px-3 rounded-md text-[11px] font-semibold bg-destructive text-destructive-foreground disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Trash2 className="size-3" /> Seçilenleri Sil
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {parts.length === 0 ? "Henüz ilanın yok." : "Aramanıza uygun ilan bulunamadı."}
        </p>
      ) : filtered.length <= 30 ? (
        <ul className="space-y-3">
          {filtered.map((p) => (
            <Row key={p.id} part={p} viewCount={views[p.id] ?? 0} onToggle={togglePassive} onDelete={deletePart} onSold={toggleSold}
              selectMode={selectMode} selected={selected.has(p.id)} onSelect={toggleSelect} />
          ))}
        </ul>
      ) : (
        <Virtuoso
          useWindowScroll
          data={filtered}
          computeItemKey={(_, p) => p.id}
          itemContent={(_, p) => (
            <div className="pb-3">
              <Row part={p} viewCount={views[p.id] ?? 0} onToggle={togglePassive} onDelete={deletePart} onSold={toggleSold}
                selectMode={selectMode} selected={selected.has(p.id)} onSelect={toggleSelect} />
            </div>
          )}
        />
      )}

      <BulkDeleteDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        count={selected.size}
        busy={bulkBusy}
        progress={bulkProgress}
        onConfirm={doBulkDelete}
      />
    </div>
  );
}

interface RowProps {
  part: ManagerPart;
  viewCount: number;
  onToggle: (p: ManagerPart) => void;
  onDelete: (p: ManagerPart) => void;
  onSold: (p: ManagerPart) => void;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const Row = memo(function Row({ part: p, viewCount, onToggle, onDelete, onSold, selectMode, selected, onSelect }: RowProps) {
  const status = STATUS_LABEL[p.status] ?? { label: p.status, cls: "text-muted-foreground border-border" };
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <li className={`bg-card border rounded-xl p-3 flex gap-3 list-none ${selected ? "border-destructive/60 ring-1 ring-destructive/30" : "border-border"}`}>
      {selectMode && (
        <div className="pt-1">
          <Checkbox checked={!!selected} onCheckedChange={() => onSelect?.(p.id)} aria-label="Ürünü seç" />
        </div>
      )}
      <Link to="/parts/$id" params={{ id: buildPartParam(p) }} className="size-20 shrink-0 rounded-lg overflow-hidden bg-secondary block">
        <SafePartImage images={p.photos} alt={p.title} width={160} className="w-full h-full object-cover" />
      </Link>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight line-clamp-2">{p.title}</h3>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${status.cls}`}>
            {status.label}
          </span>
        </div>
        {(p.brand || p.model) && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {[p.brand, p.model].filter(Boolean).join(" • ")}
          </p>
        )}
        {p.oem_code && (
          <p className="text-[10px] font-mono text-muted-foreground/80 truncate">OEM: {p.oem_code}</p>
        )}
        <div className="flex items-center gap-2">
          <div className="text-gold font-bold text-sm font-display tracking-wider">
            {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
          </div>
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
            <Eye className="size-3" /> {viewCount}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Link to="/parts/$id/edit" params={{ id: buildPartParam(p) }}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold bg-gold-gradient text-gold-foreground">
            <Pencil className="size-3" /> Düzenle
          </Link>
          <button type="button" onClick={() => onToggle(p)}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-border text-foreground hover:border-gold">
            <Power className="size-3" /> {p.status === "inactive" ? "Aktifleştir" : "Pasife Al"}
          </button>
          <button type="button" onClick={() => onDelete(p)}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10">
            <Trash2 className="size-3" /> Sil
          </button>
          <button type="button" onClick={() => onSold(p)}
            className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border ${
              p.is_sold ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border text-foreground hover:border-gold"
            }`}>
            {p.is_sold ? "Satıldı İşaretini Kaldır" : "Satıldı Olarak İşaretle"}
          </button>
          {p.status === "approved" && (
            <button type="button" onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10">
              <CheckCircle2 className="size-3" /> Satışı Onayla
            </button>
          )}
        </div>
      </div>
      <ConfirmSaleDialog open={confirmOpen} onOpenChange={setConfirmOpen} partId={p.id} partTitle={p.title} />
    </li>
  );
});

export const MyListingsManager = memo(MyListingsManagerImpl);

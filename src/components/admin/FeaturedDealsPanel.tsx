import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Trash2, Eye, EyeOff, Flame, Search, Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafePartImage } from "@/components/SafePartImage";
import {
  addFeaturedDeal,
  fetchFeaturedDealsAdmin,
  removeFeaturedDeal,
  reorderFeaturedDeals,
  toggleFeaturedDealActive,
  MAX_FEATURED_DEALS,
  type FeaturedDealWithPart,
} from "@/lib/featured-deals";

interface PartSearchRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  photos: string[] | null;
  status: string;
}

export function FeaturedDealsPanel() {
  const [rows, setRows] = useState<FeaturedDealWithPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PartSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchFeaturedDealsAdmin());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("parts")
        .select("id,title,brand,model,price,photos,status")
        .eq("status", "approved")
        .or(`title.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,oem_code.ilike.%${q}%`)
        .limit(20);
      if (cancelled) return;
      if (error) toast.error(error.message);
      setSearchResults((data ?? []) as PartSearchRow[]);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const existingIds = new Set(rows.map((r) => r.part_id));

  const onAdd = async (partId: string) => {
    setBusy(true);
    try {
      await addFeaturedDeal(partId);
      toast.success("Fırsata eklendi.");
      setSearch("");
      setSearchResults([]);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string) => {
    setBusy(true);
    try {
      await removeFeaturedDeal(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Kaldırıldı.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (id: string, next: boolean) => {
    setBusy(true);
    try {
      await toggleFeaturedDealActive(id, next);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = async (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(rows, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i }));
    setRows(reordered);
    try {
      await reorderFeaturedDeals(reordered.map((r) => r.id));
    } catch (e) {
      toast.error((e as Error).message);
      void load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4">
        <div className="flex items-start gap-2">
          <Flame className="size-5 text-orange-400 mt-0.5" />
          <div>
            <h2 className="font-display text-lg tracking-wide">🔥 Bugünün En Uygun Fiyatları</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Ana sayfadaki fırsat vitrinini elle yönet. Maks. {MAX_FEATURED_DEALS} ürün. Sürükleyerek sırala,
              göz ikonuyla yayından kaldır. Liste boşsa bölüm ana sayfada gizlenir.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <label className="text-xs font-semibold flex items-center gap-1.5">
          <Search className="size-3.5" /> Ürün ara (başlık / marka / model / OEM)
        </label>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="En az 2 karakter..."
          className="h-9"
        />
        {searching && <p className="text-[11px] text-muted-foreground">Aranıyor...</p>}
        {searchResults.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {searchResults.map((p) => {
              const already = existingIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 p-2">
                  <div className="size-10 rounded overflow-hidden bg-secondary shrink-0">
                    <SafePartImage images={p.photos} alt={p.title} width={80} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium line-clamp-1">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                      {[p.brand, p.model].filter(Boolean).join(" • ")}
                      {p.price != null && ` · ₺${Number(p.price).toLocaleString("tr-TR")}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={already || busy || rows.length >= MAX_FEATURED_DEALS}
                    onClick={() => void onAdd(p.id)}
                    className="h-8 text-[11px] bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <Plus className="size-3.5 mr-1" />
                    {already ? "Ekli" : "Fırsat Yap"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>{rows.length} / {MAX_FEATURED_DEALS} ürün seçili</span>
        {loading && <span>Yükleniyor...</span>}
      </div>

      {!loading && rows.length === 0 && (
        <div className="text-center py-8 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Henüz fırsat ürünü seçilmedi. Ana sayfada bölüm gizli görünüyor.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((r) => (
              <SortableRow
                key={r.id}
                row={r}
                busy={busy}
                onRemove={() => void onRemove(r.id)}
                onToggle={(v) => void onToggle(r.id, v)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  row,
  busy,
  onRemove,
  onToggle,
}: {
  row: FeaturedDealWithPart;
  busy: boolean;
  onRemove: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const p = row.part;
  const missing = !p;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border p-2.5 bg-card ${
        row.is_active ? "border-orange-500/40" : "border-border opacity-70"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        aria-label="Sürükle"
      >
        <GripVertical className="size-5" />
      </button>
      <div className="size-14 rounded-lg overflow-hidden bg-secondary shrink-0">
        {p ? (
          <SafePartImage images={p.photos} alt={p.title} width={120} />
        ) : (
          <div className="w-full h-full grid place-items-center text-[10px] text-destructive">Silinmiş</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold line-clamp-1">
          {missing ? "Ürün bulunamadı" : p.title}
        </p>
        {p && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {[p.brand, p.model, p.year].filter(Boolean).join(" • ") || "—"}
          </p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-gold font-bold text-sm">
            {p?.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">#{row.sort_order + 1}</span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onToggle(!row.is_active)}
        disabled={busy}
        className="h-8 text-[11px]"
        title={row.is_active ? "Yayından kaldır" : "Yayına al"}
      >
        {row.is_active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onRemove}
        disabled={busy}
        className="h-8 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

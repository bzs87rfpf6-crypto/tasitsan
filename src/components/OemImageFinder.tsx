import { useState } from "react";
import { Image as ImageIcon, Loader2, RefreshCw, ExternalLink, Database, Check, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { translateError } from "@/lib/error-messages";
import {
  findOemImages,
  setPartMainPhoto,
  type OemVisualSearchResult,
  type OemImageResult,
} from "@/lib/oem-visual-search.functions";
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

interface Props {
  partId?: string;
  oem?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  isOwner?: boolean;
  hasExistingPhoto?: boolean;
  onPhotoUpdated?: (url: string) => void;
}

function RelevanceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.75
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : value >= 0.5
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${cls} font-semibold tracking-wider`}>
      %{pct}
    </span>
  );
}

export function OemImageFinder({ partId, oem, title, brand, model, isOwner, hasExistingPhoto, onPhotoUpdated }: Props) {
  const call = useServerFn(findOemImages);
  const setMain = useServerFn(setPartMainPhoto);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OemVisualSearchResult | null>(null);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [confirmImg, setConfirmImg] = useState<OemImageResult | null>(null);

  const canSearch = Boolean(oem || title || brand);

  const run = async (force = false) => {
    setLoading(true);
    try {
      const data = await call({ data: { oem: oem ?? null, title: title ?? null, brand: brand ?? null, model: model ?? null, force } });
      setResult(data);
      if (data.images.length === 0) {
        const tried = (data.tried_queries ?? []).slice(0, 6).join(", ");
        toast.info(
          tried
            ? `Bu ürün için internet üzerinde görsel bulunamadı. Denenen sorgular: ${tried}`
            : "Bu ürün için internet üzerinde görsel bulunamadı.",
          { duration: 8000 },
        );
      }
    } catch (e) {
      console.error("[OemImageFinder] search failed", e);
      setResult(null);
      toast.error(translateError(e, "Görsel arama servisinde hata oluştu"), { duration: 7000 });
    } finally {
      setLoading(false);
    }
  };


  const applyImage = async (img: OemImageResult) => {
    if (!partId) return;
    setSavingUrl(img.url);
    try {
      const res = await setMain({ data: { partId, imageUrl: img.url } });
      toast.success("Ürün görseli başarıyla güncellendi.");
      onPhotoUpdated?.(res.url);
    } catch (e) {
      console.error("[OemImageFinder] save failed", e);
      toast.error(translateError(e, "Görsel kaydedilemedi"));
    } finally {
      setSavingUrl(null);
      setConfirmImg(null);
    }
  };

  const onPick = (img: OemImageResult) => {
    if (!isOwner || !partId) return;
    if (hasExistingPhoto) setConfirmImg(img);
    else applyImage(img);
  };

  return (
    <section className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-display text-gold tracking-wide flex items-center gap-1.5">
            <ImageIcon className="size-4" /> İnternetten görsel bul
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Ürün adı, OEM ve marka bilgileriyle internet aranır; uygun görseller alaka sırasına göre listelenir.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={loading || !canSearch}
            className="h-9 px-3 rounded-lg text-xs font-semibold bg-gold-gradient text-gold-foreground shadow-gold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
            {result ? "Yenile" : "Görsel Bul"}
          </button>
          {result?.cached && (
            <button
              type="button"
              onClick={() => run(true)}
              disabled={loading}
              className="h-7 px-2 rounded-md text-[10px] border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
              title="Önbelleği atla ve yeniden ara"
            >
              <RefreshCw className="size-3" /> Yeniden ara
            </button>
          )}
        </div>
      </div>

      {!canSearch && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <AlertCircle className="size-3" /> OEM, marka veya ürün adı gerekli.
        </p>
      )}

      {result && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            {result.cached && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground bg-card/50 border border-border rounded px-2 py-1">
                <Database className="size-3" /> Önbellekten
                {result.cache_age_hours != null && (
                  <span>· {result.cache_age_hours < 1 ? "<1 saat" : `${Math.round(result.cache_age_hours)} saat`}</span>
                )}
              </span>
            )}
            <span className="text-muted-foreground bg-card/50 border border-border rounded px-2 py-1">
              Sorgu: <span className="text-foreground/80">{result.query}</span>
            </span>
            {result.tried_queries && result.tried_queries.length > 1 && (
              <span className="text-muted-foreground">({result.tried_queries.length} sorgu denendi)</span>
            )}
          </div>

          {result.images.length === 0 ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>Bu ürün için internet üzerinde görsel bulunamadı.</p>
              {result.tried_queries && result.tried_queries.length > 0 && (
                <div className="text-[10px]">
                  <div className="font-semibold text-foreground/70 mb-0.5">Denenen sorgular:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {result.tried_queries.map((q) => (
                      <li key={q} className="break-all">{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {result.images.map((img) => {
                const saving = savingUrl === img.url;
                return (
                  <div
                    key={img.url}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-card hover:border-gold/60 transition"
                  >
                    <img
                      src={img.url}
                      alt={img.source_title || oem || title || ""}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                    />
                    <div className="absolute top-1 right-1">
                      <RelevanceBadge value={img.relevance} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-1 text-[9px] text-white">
                        <a href={img.source_url || img.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline inline-flex items-center gap-0.5">
                          {img.source_domain} <ExternalLink className="size-2.5 shrink-0" />
                        </a>
                      </div>
                      {isOwner && partId && (
                        <button
                          type="button"
                          onClick={() => onPick(img)}
                          disabled={saving}
                          className="h-6 rounded text-[10px] font-semibold bg-gold-gradient text-gold-foreground inline-flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                          Ana resim yap
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmImg} onOpenChange={(o) => !o && setConfirmImg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ana resmi değiştirmek istiyor musunuz?</AlertDialogTitle>
            <AlertDialogDescription>
              Mevcut ana resim yerine seçtiğiniz görsel kullanılacak. Önceki resimler galeride saklanır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!savingUrl}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmImg && applyImage(confirmImg)} disabled={!!savingUrl}>
              {savingUrl ? "Kaydediliyor…" : "Değiştir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

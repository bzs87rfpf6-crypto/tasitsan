import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Sparkles, Upload, X, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { analyzePartImage } from "@/lib/api/vision.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PartCard, type Part } from "@/components/PartCard";

type AnalysisResult = {
  part_name: string;
  category: string;
  confidence: number;
  keywords: string[];
  description: string;
  oem_code_guess: string;
  brand_compatibility: string[];
  model_compatibility: string[];
};

const MAX_BYTES = 6 * 1024 * 1024;

// Resize/compress before sending to keep payload small.
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const maxDim = 1024;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function PhotoSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const analyze = useServerFn(analyzePartImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [similar, setSimilar] = useState<Part[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);

  const reset = () => {
    setPreview(null); setResult(null); setSimilar([]); setAnalyzing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Lütfen bir görsel seçin."); return; }
    if (file.size > MAX_BYTES) { toast.error("Görsel 6MB'tan küçük olmalı."); return; }
    setAnalyzing(true);
    setResult(null); setSimilar([]);
    try {
      const compressed = await fileToCompressedDataUrl(file);
      setPreview(compressed);
      const res = await analyze({ data: { imageDataUrl: compressed } });
      if (!res.ok) { toast.error(res.error); setAnalyzing(false); return; }
      setResult(res.result);

      // Fetch similar listings using OEM, brand, model, keywords and category
      const esc = (s: string) => s.replace(/[%,()]/g, " ").trim();
      const ors: string[] = [];
      const oem = esc(res.result.oem_code_guess ?? "");
      if (oem) ors.push(`oem_code.ilike.%${oem}%`);
      for (const k of res.result.keywords.filter(Boolean).slice(0, 5)) {
        const v = esc(k);
        if (!v) continue;
        ors.push(`title.ilike.%${v}%`, `description.ilike.%${v}%`);
      }
      for (const b of (res.result.brand_compatibility ?? []).slice(0, 4)) {
        const v = esc(b);
        if (v) ors.push(`brand.ilike.%${v}%`);
      }
      for (const m of (res.result.model_compatibility ?? []).slice(0, 4)) {
        const v = esc(m);
        if (v) ors.push(`model.ilike.%${v}%`);
      }
      let q = supabase.from("parts")
        .select("id,title,brand,model,year,price,city,photos,condition,stock_quantity,oem_code")
        .limit(12);
      if (ors.length) q = q.or(ors.join(","));
      const { data } = await q;
      setSimilar((data ?? []) as Part[]);
    } catch (e) {
      console.error(e);
      toast.error("Görsel işlenemedi.");
    } finally {
      setAnalyzing(false);
    }
  };

  const lowConfidence = result && result.confidence < 50;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wide flex items-center gap-2">
              <Sparkles className="size-5 text-gold" /> Fotoğraftan Parça Bul
            </DialogTitle>
            <DialogDescription>
              Parçanın net bir fotoğrafını yükleyin, yapay zeka tanımlasın ve benzer ürünleri gösterelim.
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-gold/60 hover:bg-gold/5 transition-colors"
            >
              <div className="size-14 rounded-full bg-gold/10 grid place-items-center mx-auto mb-3">
                <Camera className="size-7 text-gold" />
              </div>
              <p className="font-semibold">Fotoğraf yükleyin veya çekin</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG • Maks 6MB</p>
              <Button type="button" className="mt-4 bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                <Upload className="size-4 mr-1.5" /> Dosya Seç
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-secondary aspect-video max-h-72">
                <img src={preview} alt="Yüklenen parça" className="w-full h-full object-contain" />
                <button
                  onClick={reset}
                  className="absolute top-2 right-2 size-8 rounded-full bg-background/80 grid place-items-center hover:bg-background"
                  aria-label="Temizle"
                >
                  <X className="size-4" />
                </button>
              </div>

              {analyzing && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-gold" /> Görsel analiz ediliyor...
                </div>
              )}

              {result && !analyzing && (
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-gold font-semibold">Tahmini Parça</p>
                        <h3 className="font-display text-lg leading-tight">{result.part_name}</h3>
                        <p className="text-xs text-muted-foreground">{result.category}</p>
                      </div>
                      <ConfidenceBadge value={result.confidence} />
                    </div>
                    {result.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{result.description}</p>
                    )}
                    {(result.oem_code_guess || result.brand_compatibility?.length || result.model_compatibility?.length) ? (
                      <div className="grid grid-cols-1 gap-1.5 pt-2 text-xs">
                        {result.oem_code_guess && (
                          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 border border-border px-2 py-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">OEM</span>
                            <span className="font-mono text-gold">{result.oem_code_guess}</span>
                          </div>
                        )}
                        {result.brand_compatibility?.length > 0 && (
                          <div className="flex items-start justify-between gap-2 rounded-md bg-muted/40 border border-border px-2 py-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Marka</span>
                            <span className="text-right">{result.brand_compatibility.join(", ")}</span>
                          </div>
                        )}
                        {result.model_compatibility?.length > 0 && (
                          <div className="flex items-start justify-between gap-2 rounded-md bg-muted/40 border border-border px-2 py-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Model</span>
                            <span className="text-right">{result.model_compatibility.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    ) : null}
                    {result.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {result.keywords.map((k) => (
                          <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            #{k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>


                  {lowConfidence ? (
                    <div className="bg-destructive/5 border border-destructive/30 rounded-2xl p-4 text-center space-y-3">
                      <AlertTriangle className="size-7 text-destructive mx-auto" />
                      <div>
                        <p className="font-semibold text-sm">Parça doğrulanamadı.</p>
                        <p className="text-xs text-muted-foreground">Uzman incelemesi için talep oluşturun.</p>
                      </div>
                      <Button onClick={() => setRequestOpen(true)} className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                        Uzman Talebi Oluştur
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wider text-gold font-semibold">Benzer Ürünler</p>
                        <button onClick={() => fileRef.current?.click()} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <RefreshCw className="size-3" /> Yeni Görsel
                        </button>
                      </div>
                      {similar.length === 0 ? (
                        <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
                          <p className="text-sm">Sistemde eşleşen ürün bulunamadı.</p>
                          <Button size="sm" onClick={() => setRequestOpen(true)} className="bg-gold-gradient text-gold-foreground font-semibold">
                            Parça Talebi Oluştur
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {similar.map((p) => <PartCard key={p.id} part={p} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </DialogContent>
      </Dialog>

      <ExpertRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        userId={user?.id ?? null}
        photo={preview}
        result={result}
      />
    </>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone =
    value >= 75 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : value >= 50 ? "bg-gold/15 text-gold border-gold/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${tone}`}>
      %{value} güven
    </div>
  );
}

function ExpertRequestDialog({
  open, onOpenChange, userId, photo, result,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; userId: string | null;
  photo: string | null; result: AnalysisResult | null;
}) {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { toast.error("Talep oluşturmak için giriş yapın."); return; }
    if (!form.full_name.trim() || !form.phone.trim() || !form.message.trim()) {
      toast.error("Ad soyad, telefon ve mesaj zorunludur."); return;
    }
    setSubmitting(true);

    const composedMessage = [
      form.message.trim(),
      result ? `\n\n[Görsel Analiz]\nTahmin: ${result.part_name} (%${result.confidence})\nKategori: ${result.category}\nAnahtar: ${result.keywords?.join(", ")}` : "",
    ].join("");

    const { error } = await supabase.from("part_requests").insert({
      buyer_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      search_query: result ? `[Foto] ${result.part_name}` : "[Foto] uzman incelemesi",
      category: result?.category ?? null,
      message: composedMessage,
    });

    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Talebiniz alındı. Taşıtsan ekibi en kısa sürede dönüş yapacak.");
    setForm({ full_name: "", phone: "", email: "", message: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Uzman İncelemesi Talebi</DialogTitle>
          <DialogDescription>
            Yüklediğiniz görsel ve analiz sonuçları Taşıtsan uzmanlarına iletilir.
          </DialogDescription>
        </DialogHeader>

        {!userId ? (
          <div className="text-sm text-muted-foreground py-2">
            Talep oluşturmak için <Link to="/auth" className="text-gold font-semibold">giriş yapın</Link>.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {photo && (
              <img src={photo} alt="Önizleme" className="w-full max-h-40 object-contain rounded-lg bg-secondary" />
            )}
            <Input placeholder="Ad Soyad *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={100} />
            <Input placeholder="Telefon *" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
            <Input placeholder="E-posta (opsiyonel)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} />
            <Textarea placeholder="Aradığınız parça hakkında detay verin *" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} maxLength={500} className="resize-none" />
            <Button type="submit" disabled={submitting} className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
              {submitting ? "Gönderiliyor..." : "Talebi Gönder"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

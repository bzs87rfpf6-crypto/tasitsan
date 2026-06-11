import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Search, Camera, Upload, X, RefreshCw, PackageSearch, Globe2, Zap, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lookupCachedResearch, researchPart } from "@/lib/api/ai-expert-pro.functions";
import { analyzePartImage } from "@/lib/api/vision.functions";
import { checkRateLimit } from "@/lib/security.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PartCard, type Part } from "@/components/PartCard";

const normalizeOemCode = (s: string) =>
  s.toUpperCase().replace(/[\s\-_.\/]/g, "").trim();



type Research = {
  part_name: string;
  category: string;
  primary_oem: string;
  candidate_oems: string[];
  equivalent_oems: string[];
  compatible_vehicles: string[];
  keywords: string[];
  description: string;
  confidence: number;
};

const MAX_BYTES = 6 * 1024 * 1024;

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
    const r = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * r); height = Math.round(height * r);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function AiExpertProDialog({
  open,
  onOpenChange,
  onCreateRequest,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreateRequest?: (initial: { search_query: string; brand: string; model: string; year: string; oem: string; category: string }) => void;
}) {
  const research = useServerFn(researchPart);
  const lookupCache = useServerFn(lookupCachedResearch);
  const analyze = useServerFn(analyzePartImage);
  const rateLimit = useServerFn(checkRateLimit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"text" | "photo">("text");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "db" | "vision" | "cache" | "ai" | "done">("idle");
  const [source, setSource] = useState<"db" | "vision" | "cache" | "ai" | null>(null);
  const [result, setResult] = useState<Research | null>(null);
  const [matches, setMatches] = useState<Part[]>([]);


  const reset = () => {
    setQuery(""); setPreview(null); setResult(null); setMatches([]); setLoading(false);
    setStage("idle"); setSource(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const searchInternalDb = async (oems: string[], keywords: string[]) => {
    // Build OEM variations: both raw upper and normalized (no separators)
    const oemSet = new Set<string>();
    for (const o of oems.filter(Boolean)) {
      const upper = o.toUpperCase().trim();
      if (upper) oemSet.add(upper);
      const norm = normalizeOemCode(o);
      if (norm) oemSet.add(norm);
    }
    const ors: string[] = [];
    for (const o of Array.from(oemSet).slice(0, 25)) {
      const safe = o.replace(/[%,(){}]/g, "");
      if (!safe) continue;
      ors.push(`oem_code.ilike.%${safe}%`, `oem_codes.cs.{${safe}}`);
    }
    for (const k of (keywords ?? []).slice(0, 6)) {
      const safe = k.replace(/[%,(){}]/g, "").trim();
      if (safe.length < 2) continue;
      ors.push(`title.ilike.%${safe}%`, `description.ilike.%${safe}%`);
    }
    let q = supabase
      .from("parts")
      .select("id,title,brand,model,year,price,city,photos,condition,stock_quantity,oem_code,part_type")
      .eq("status", "approved")
      .limit(30);
    if (ors.length) q = q.or(ors.join(","));
    const { data } = await q;
    return (data ?? []) as Part[];
  };

  // OEM-only DB scan (strict). Uses a Postgres RPC that normalizes BOTH sides
  // (strips spaces/dashes/dots/slashes, upper-cases) so stored values like
  // "90366-T0061" match user input "90366T0061" or "90366 t0061".
  const searchByOem = async (oems: string[]) => {
    const seen = new Set<string>();
    const out: Part[] = [];
    const normalized = Array.from(
      new Set(oems.map((o) => normalizeOemCode(o)).filter((o) => o.length >= 3)),
    ).slice(0, 10);
    for (const norm of normalized) {
      const { data, error } = await supabase.rpc("search_parts_by_oem", { _oem: norm });
      if (error) {
        console.warn("search_parts_by_oem failed", error);
        continue;
      }
      for (const row of (data ?? []) as Part[]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          out.push(row);
        }
      }
      if (out.length >= 30) break;
    }
    return out;
  };

  const run = async () => {
    if (tab === "text" && query.trim().length < 2) { toast.error("OEM kodu veya parça açıklaması girin."); return; }
    if (tab === "photo" && !preview) { toast.error("Önce bir görsel yükleyin."); return; }
    setLoading(true); setResult(null); setMatches([]); setSource(null);

    try {
      const isText = tab === "text";
      const raw = query.trim();

      // ============ TEXT MODE ============
      if (isText) {
        // STAGE 1 — Strict OEM search (normalized) on Taşıtsan DB
        setStage("db");
        const oemHits = await searchByOem([raw]);
        if (oemHits.length > 0) {
          setMatches(oemHits);
          setSource("db");
          setStage("done");
          setLoading(false);
          return;
        }

        // STAGE 2 — Broader DB search (title/description/keywords)
        const broadHits = await searchInternalDb([raw], [raw]);
        if (broadHits.length > 0) {
          setMatches(broadHits);
          setSource("db");
          setStage("done");
          setLoading(false);
          return;
        }

        // STAGE 3 — Cache lookup
        setStage("cache");
        const cached = await lookupCache({ data: { query: raw } });
        if (cached.ok && cached.hit && cached.result) {
          const r = cached.result as Research;
          setResult(r); setSource("cache");
          const fullMatches = await searchInternalDb(
            [r.primary_oem, ...r.candidate_oems, ...r.equivalent_oems],
            r.keywords,
          );
          setMatches(fullMatches);
          setStage("done");
          setLoading(false);
          return;
        }
      }

      // ============ PHOTO MODE ============
      if (!isText && preview) {
        // STAGE 1 — Vision: extract OEM + keywords from image (cheap, no internet research)
        setStage("vision");
        const vision = await analyze({ data: { imageDataUrl: preview } });
        if (vision.ok) {
          const v = vision.result;
          const oemGuess = (v.oem_code_guess ?? "").trim();

          // STAGE 2 — Search DB by extracted OEM
          if (oemGuess) {
            setStage("db");
            const oemHits = await searchByOem([oemGuess]);
            if (oemHits.length > 0) {
              setMatches(oemHits);
              setResult({
                part_name: v.part_name,
                category: v.category,
                primary_oem: oemGuess,
                candidate_oems: [],
                equivalent_oems: [],
                compatible_vehicles: [
                  ...(v.brand_compatibility ?? []),
                  ...(v.model_compatibility ?? []),
                ],
                keywords: v.keywords ?? [],
                description: v.description ?? "",
                confidence: v.confidence,
              });
              setSource("vision");
              setStage("done");
              setLoading(false);
              return;
            }
          }

          // STAGE 3 — Broader DB search using part name + keywords
          const broadHits = await searchInternalDb(
            oemGuess ? [oemGuess] : [],
            [v.part_name, ...(v.keywords ?? [])],
          );
          if (broadHits.length > 0) {
            setMatches(broadHits);
            setResult({
              part_name: v.part_name,
              category: v.category,
              primary_oem: oemGuess,
              candidate_oems: [],
              equivalent_oems: [],
              compatible_vehicles: [
                ...(v.brand_compatibility ?? []),
                ...(v.model_compatibility ?? []),
              ],
              keywords: v.keywords ?? [],
              description: v.description ?? "",
              confidence: v.confidence,
            });
            setSource("vision");
            setStage("done");
            setLoading(false);
            return;
          }
        }
      }

      // ============ STAGE FINAL — AI internet research (only if DB truly empty) ============
      setStage("ai");
      const rl = await rateLimit({
        data: { action: "ai-expert", max: 20, windowSeconds: 60, scope: "ip+user" },
      });
      if (!rl.allowed) {
        toast.error(`AI uzmanı çok yoğun. ${rl.retry_after_seconds} sn sonra tekrar dene.`);
        setStage("idle"); setLoading(false); return;
      }
      const res = await research({
        data: {
          query: raw || undefined,
          imageDataUrl: tab === "photo" && preview ? preview : undefined,
        },
      });
      if (!res.ok) { toast.error(res.error); setStage("idle"); setLoading(false); return; }
      setResult(res.result); setSource("ai");
      const finalMatches = await searchInternalDb(
        [res.result.primary_oem, ...res.result.candidate_oems, ...res.result.equivalent_oems],
        res.result.keywords,
      );
      setMatches(finalMatches);
      setStage("done");
    } catch (e) {
      console.error(e);
      toast.error("Araştırma yapılamadı.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };


  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Lütfen bir görsel seçin."); return; }
    if (file.size > MAX_BYTES) { toast.error("Görsel 6MB'tan küçük olmalı."); return; }
    const compressed = await fileToCompressedDataUrl(file);
    setPreview(compressed);
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide flex items-center gap-2">
            <Sparkles className="size-5 text-gold" /> AI Parça Uzmanı 2.0
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Globe2 className="size-3.5 text-gold" />
            OEM girin veya fotoğraf yükleyin. Yapay zeka geniş kaynaklardan araştırır, ardından Taşıtsan stoklarını tarar.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl">
          <button
            type="button"
            onClick={() => setTab("text")}
            className={`h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${
              tab === "text" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            <Search className="size-4" /> OEM / Metin
          </button>
          <button
            type="button"
            onClick={() => setTab("photo")}
            className={`h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${
              tab === "photo" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            <Camera className="size-4" /> Fotoğraf
          </button>
        </div>

        {tab === "text" && (
          <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="OEM (örn. A2118200561) veya '2018 Corolla sağ ön far'"
              maxLength={400}
              className="h-12 bg-card"
              autoFocus
            />
            <Button type="submit" disabled={loading} className="h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold shrink-0">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </form>
        )}

        {tab === "photo" && (
          <div className="space-y-3">
            {!preview ? (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-6 text-center cursor-pointer hover:border-gold/60 hover:bg-gold/5 transition-colors"
              >
                <div className="size-12 rounded-full bg-gold/10 grid place-items-center mx-auto mb-2">
                  <Camera className="size-6 text-gold" />
                </div>
                <p className="font-semibold text-sm">Fotoğraf yükle</p>
                <p className="text-[11px] text-muted-foreground mt-1">JPG, PNG, WEBP • Maks 6MB</p>
                <Button type="button" className="mt-3 bg-gold-gradient text-gold-foreground font-semibold shadow-gold" size="sm">
                  <Upload className="size-4 mr-1.5" /> Dosya Seç
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-secondary aspect-video max-h-60">
                  <img src={preview} alt="Yüklenen" className="w-full h-full object-contain" />
                  <button
                    onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="absolute top-2 right-2 size-8 rounded-full bg-background/80 grid place-items-center hover:bg-background"
                    aria-label="Temizle"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="(Opsiyonel) Araç markası/modeli ekleyin"
                  maxLength={200}
                  className="bg-card"
                />
                <Button onClick={() => void run()} disabled={loading} className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                  {loading ? <><Loader2 className="size-4 animate-spin mr-1.5" /> Araştırılıyor...</> : <><Sparkles className="size-4 mr-1.5" /> Araştır</>}
                </Button>
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
              }}
            />
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground bg-muted/40 border border-border rounded-xl">
            <Loader2 className="size-3.5 animate-spin text-gold" />
            {stage === "vision" && "Görsel analiz ediliyor..."}
            {stage === "db" && "Taşıtsan stokları taranıyor..."}
            {stage === "cache" && "Önbellek kontrol ediliyor..."}
            {stage === "ai" && "AI geniş kaynaklarda araştırıyor..."}
          </div>
        )}

        {/* Quick DB matches (visible the instant they arrive, even before AI finishes) */}
        {!result && matches.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
              <Database className="size-3.5" /> Stoklarda hızlı eşleşmeler ({matches.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {matches.map((p) => <PartCard key={p.id} part={p} />)}
            </div>
          </div>
        )}

        {result && (

          <div className="space-y-4">
            {/* Research card */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-gold font-semibold">Araştırma Sonucu</p>
                    {source === "cache" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                        <Zap className="size-2.5" /> Önbellekten · anında
                      </span>
                    )}
                    {source === "ai" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-gold/15 text-gold border border-gold/30">
                        <Sparkles className="size-2.5" /> AI araştırması
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg leading-tight">{result.part_name || "—"}</h3>
                  <p className="text-xs text-muted-foreground">{result.category}</p>
                </div>
                <div className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold border bg-gold/15 text-gold border-gold/30">
                  %{result.confidence} güven
                </div>
              </div>


              {result.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{result.description}</p>
              )}

              <div className="grid gap-2 text-xs">
                {result.primary_oem && (
                  <Row label="OEM">
                    <span className="font-mono text-gold">{result.primary_oem}</span>
                  </Row>
                )}
                {result.candidate_oems.filter((o) => o !== result.primary_oem).length > 0 && (
                  <Row label="Alternatif OEM">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {result.candidate_oems.filter((o) => o !== result.primary_oem).map((o) => (
                        <span key={o} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/30">{o}</span>
                      ))}
                    </div>
                  </Row>
                )}
                {result.equivalent_oems.length > 0 && (
                  <Row label="Muadil OEM">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {result.equivalent_oems.map((o) => (
                        <span key={o} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">≈ {o}</span>
                      ))}
                    </div>
                  </Row>
                )}
                {result.compatible_vehicles.length > 0 && (
                  <Row label="Uyumlu Araçlar">
                    <div className="flex flex-wrap gap-1 justify-end max-w-[70%]">
                      {result.compatible_vehicles.map((v) => (
                        <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{v}</span>
                      ))}
                    </div>
                  </Row>
                )}
                {result.keywords.length > 0 && (
                  <Row label="Anahtar Kelimeler">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {result.keywords.map((k) => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">#{k}</span>
                      ))}
                    </div>
                  </Row>
                )}
              </div>

              <button onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RefreshCw className="size-3" /> Yeni araştırma
              </button>
            </div>

            {/* Internal listings */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">
                  Taşıtsan'daki İlanlar ({matches.length})
                </p>
              </div>

              {matches.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {matches.map((p) => <PartCard key={p.id} part={p} />)}
                </div>
              ) : (
                <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-3">
                  <PackageSearch className="size-7 text-muted-foreground mx-auto" />
                  <p className="text-sm">Taşıtsan'da eşleşen ilan bulunamadı.</p>
                  <p className="text-[11px] text-muted-foreground">
                    Yine de parça bilgilerini yukarıdan görebilirsiniz. İsterseniz talep oluşturalım, satıcılara iletelim.
                  </p>
                  {onCreateRequest && (
                    <Button
                      onClick={() => {
                        onCreateRequest({
                          search_query: result.part_name || query,
                          brand: "",
                          model: "",
                          year: "",
                          oem: result.primary_oem || result.candidate_oems[0] || "",
                          category: result.category || "",
                        });
                        onOpenChange(false);
                      }}
                      className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold"
                    >
                      🚀 Parça Talebi Oluştur
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md bg-muted/40 border border-border px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseOemList } from "@/lib/oem";

export const Route = createFileRoute("/sell/bulk")({
  head: () => ({ meta: [{ title: "Toplu Parça Yükle — Taşıtsan" }] }),
  component: BulkUploadPage,
});

type Mode = "insert" | "update" | "stock";

const HEADERS = [
  "OEM NO",
  "PARÇA ADI",
  "MARKA",
  "ARAÇ MARKASI",
  "ARAÇ MODELİ",
  "MODEL YILI",
  "ADET",
  "FİYAT",
  "AÇIKLAMA",
] as const;

const HEADER_ALIASES: Record<string, (typeof HEADERS)[number]> = {
  "oem": "OEM NO", "oem no": "OEM NO", "oem_no": "OEM NO", "oem numarası": "OEM NO", "oem_code": "OEM NO",
  "parça adı": "PARÇA ADI", "parca adi": "PARÇA ADI", "başlık": "PARÇA ADI", "title": "PARÇA ADI",
  "marka": "MARKA", "brand": "MARKA",
  "araç markası": "ARAÇ MARKASI", "arac markasi": "ARAÇ MARKASI", "vehicle_brand": "ARAÇ MARKASI",
  "araç modeli": "ARAÇ MODELİ", "arac modeli": "ARAÇ MODELİ", "model": "ARAÇ MODELİ",
  "model yılı": "MODEL YILI", "model yili": "MODEL YILI", "yıl": "MODEL YILI", "year": "MODEL YILI",
  "adet": "ADET", "stok": "ADET", "stock": "ADET", "quantity": "ADET",
  "fiyat": "FİYAT", "price": "FİYAT", "tutar": "FİYAT",
  "açıklama": "AÇIKLAMA", "aciklama": "AÇIKLAMA", "description": "AÇIKLAMA", "not": "AÇIKLAMA",
};

interface Row {
  __index: number;
  oem: string[];
  title: string;
  brand: string;
  vehicleBrand: string;
  vehicleModel: string;
  year: number | null;
  qty: number;
  price: number | null;
  description: string;
  errors: string[];
  warnings: string[];
  duplicate?: boolean;
}

function normalizeKey(k: string): (typeof HEADERS)[number] | null {
  const low = String(k ?? "").trim().toLowerCase();
  if (!low) return null;
  if ((HEADERS as readonly string[]).map((h) => h.toLowerCase()).includes(low)) {
    return HEADERS.find((h) => h.toLowerCase() === low) ?? null;
  }
  return HEADER_ALIASES[low] ?? null;
}

function parseRows(raw: Record<string, unknown>[]): Row[] {
  return raw.map((r, i) => {
    const get = (h: (typeof HEADERS)[number]): string => {
      for (const key of Object.keys(r)) {
        if (normalizeKey(key) === h) {
          const v = r[key];
          return v == null ? "" : String(v).trim();
        }
      }
      return "";
    };
    const oemRaw = get("OEM NO");
    const oem = parseOemList(oemRaw);
    const title = get("PARÇA ADI");
    const brand = get("MARKA");
    const vehicleBrand = get("ARAÇ MARKASI");
    const vehicleModel = get("ARAÇ MODELİ");
    const yearStr = get("MODEL YILI").replace(/\D/g, "").slice(0, 4);
    const year = yearStr ? parseInt(yearStr) : null;
    const qtyStr = get("ADET").replace(/\D/g, "");
    const qty = qtyStr ? Math.max(0, parseInt(qtyStr)) : 1;
    const priceStr = get("FİYAT").replace(/[^\d.,]/g, "").replace(",", ".");
    const price = priceStr ? parseFloat(priceStr) : null;
    const description = get("AÇIKLAMA");

    const errors: string[] = [];
    if (oem.length === 0) errors.push("OEM NO eksik");
    if (!title) errors.push("PARÇA ADI eksik");
    if (!vehicleBrand) errors.push("ARAÇ MARKASI eksik");
    if (!vehicleModel) errors.push("ARAÇ MODELİ eksik");
    if (price == null || price <= 0) errors.push("FİYAT geçersiz");
    if (year && (year < 1950 || year > new Date().getFullYear() + 1)) errors.push("MODEL YILI geçersiz");

    return {
      __index: i + 2, // +2 = header row + 1-indexed
      oem, title, brand, vehicleBrand, vehicleModel, year, qty, price: price ?? null,
      description, errors, warnings: [],
    };
  });
}

function BulkUploadPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("insert");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<{ whatsapp: string; city: string | null; approved: boolean } | null>(null);
  const [result, setResult] = useState<{ ok: number; fail: number; details: string[] } | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("whatsapp,city,is_approved").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      setProfile({
        whatsapp: p.data?.whatsapp ?? "",
        city: p.data?.city ?? null,
        approved: !!r.data || !!p.data?.is_approved,
      });
    })();
  }, [user]);

  // Detect duplicates within sheet + against DB
  useEffect(() => {
    if (rows.length === 0) return;
    // local duplicate detection
    const seen = new Map<string, number>();
    rows.forEach((r) => {
      r.oem.forEach((code) => seen.set(code, (seen.get(code) ?? 0) + 1));
    });
    const localDupOems = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));

    // db duplicate detection
    if (!user) return;
    const allOems = Array.from(new Set(rows.flatMap((r) => r.oem)));
    if (allOems.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("parts")
        .select("oem_codes")
        .eq("seller_id", user.id)
        .overlaps("oem_codes", allOems);
      const dbOems = new Set((data ?? []).flatMap((p) => p.oem_codes ?? []));
      setRows((prev) =>
        prev.map((r) => {
          const dupLocal = r.oem.some((c) => localDupOems.has(c));
          const dupDb = r.oem.some((c) => dbOems.has(c));
          const warnings: string[] = [];
          if (dupLocal) warnings.push("Dosyada tekrar eden OEM");
          if (dupDb) warnings.push("Bu OEM ile mevcut ilanınız var");
          return { ...r, duplicate: dupLocal || dupDb, warnings };
        }),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, user?.id]);

  const onFile = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (json.length === 0) {
        toast.error("Dosya boş görünüyor.");
        return;
      }
      if (json.length > 1000) {
        toast.error("Tek seferde en fazla 1000 satır yükleyebilirsiniz.");
        return;
      }
      setRows(parseRows(json));
      toast.success(`${json.length} satır okundu.`);
    } catch (e: any) {
      console.error("[bulk] parse error", e);
      toast.error("Dosya okunamadı. Lütfen geçerli bir Excel/CSV yükleyin.");
    }
  };

  const downloadTemplate = () => {
    const data: (string | number)[][] = [
      [...HEADERS],
      ["A1234567890", "Sağ Far Komple", "Hella", "Mercedes", "W211", 2008, 1, 4500, "Çıkma, çiziksiz"],
      ["B9876543210", "Sol Ön Çamurluk", "Orijinal", "BMW", "F30", 2015, 2, 2750, "Hafif boyalı"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = HEADERS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parçalar");
    XLSX.writeFile(wb, "tasitsan-toplu-parca-sablonu.xlsx");
  };

  const valid = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalid = rows.length - valid.length;

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!user || !profile) return;
    if (mode === "insert" && !profile.approved) {
      toast.error("Hesabınız henüz onaylanmadı.");
      return;
    }
    if (valid.length === 0) {
      toast.error("Geçerli satır yok.");
      return;
    }
    if (mode === "insert" && !profile.whatsapp) {
      toast.error("Önce profilinize WhatsApp numarası ekleyin.");
      return;
    }
    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    const details: string[] = [];

    for (const r of valid) {
      try {
        if (mode === "insert") {
          const { error } = await supabase.from("parts").insert({
            seller_id: user.id,
            title: r.title,
            description: r.description || null,
            brand: r.vehicleBrand || null,
            model: r.vehicleModel || null,
            year: r.year,
            oem_codes: r.oem,
            category: "Diğer",
            condition: "used",
            price: r.price,
            stock_quantity: r.qty,
            city: profile.city,
            photos: [],
            whatsapp: profile.whatsapp,
            status: "pending",
          });
          if (error) throw error;
          ok++;
        } else {
          // update or stock — find user's part by any matching OEM
          const { data: found } = await supabase
            .from("parts")
            .select("id")
            .eq("seller_id", user.id)
            .overlaps("oem_codes", r.oem)
            .limit(1)
            .maybeSingle();
          if (!found) {
            fail++;
            details.push(`Satır ${r.__index}: ${r.oem[0]} ile eşleşen ilan bulunamadı`);
            continue;
          }
          const patch = mode === "stock"
            ? { stock_quantity: r.qty }
            : {
                title: r.title,
                description: r.description || null,
                brand: r.vehicleBrand || null,
                model: r.vehicleModel || null,
                year: r.year,
                price: r.price,
                stock_quantity: r.qty,
              };
          const { error } = await supabase.from("parts").update(patch).eq("id", found.id);
          if (error) throw error;
          ok++;
        }
      } catch (e: any) {
        fail++;
        details.push(`Satır ${r.__index}: ${e?.message ?? "bilinmeyen hata"}`);
      }
    }

    setResult({ ok, fail, details });
    setSubmitting(false);
    if (ok > 0) toast.success(`${ok} kayıt işlendi.`);
    if (fail > 0) toast.error(`${fail} kayıt başarısız.`);
  };

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitle="Toplu Parça Yükle" />
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <Link to="/sell" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-3.5" /> Tekli ilan girişine dön
        </Link>

        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2">
          {([
            ["insert", "Yeni İlan"],
            ["update", "Toplu Güncelle"],
            ["stock", "Stok Güncelle"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setMode(v); setResult(null); }}
              className={`h-11 rounded-lg text-xs font-semibold border ${
                mode === v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {mode === "insert" && <><span className="text-gold font-semibold">Yeni İlan modu:</span> Her satır admin onayı için bekleyen yeni ilan olarak eklenir. Fotoğraflar daha sonra ilan düzenleme ekranından eklenmelidir.</>}
          {mode === "update" && <><span className="text-gold font-semibold">Toplu Güncelle:</span> OEM numarasına göre kendi ilanlarınızı bulur ve başlık, fiyat, stok dahil tüm alanları günceller.</>}
          {mode === "stock" && <><span className="text-gold font-semibold">Stok Güncelle:</span> Yalnızca ADET sütunu kullanılır; OEM eşleşen ilanlarınızın stok adedi güncellenir.</>}
        </div>

        {/* Template + Upload */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={downloadTemplate}
            className="h-12 border-gold/40 text-gold hover:bg-gold/10"
          >
            <Download className="size-4 mr-2" /> Şablon İndir
          </Button>
          <label
            htmlFor="bulk-file-input"
            className="h-12 inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient text-gold-foreground font-medium text-sm cursor-pointer px-4 select-none active:opacity-90"
          >
            <Upload className="size-4" /> Dosya Seç
          </label>
          <input
            ref={fileRef}
            id="bulk-file-input"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>

        {fileName && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="flex items-center gap-2 truncate">
              <FileSpreadsheet className="size-4 text-gold shrink-0" />
              <span className="truncate">{fileName}</span>
              <span className="text-muted-foreground">• {rows.length} satır</span>
            </span>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground p-1" aria-label="Temizle">
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Summary */}
        {rows.length > 0 && !result && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border bg-card px-2 py-3">
              <div className="text-lg font-display text-foreground">{rows.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Toplam</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-3">
              <div className="text-lg font-display text-emerald-400">{valid.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/80">Geçerli</div>
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-3">
              <div className="text-lg font-display text-destructive">{invalid}</div>
              <div className="text-[10px] uppercase tracking-wider text-destructive/80">Hatalı</div>
            </div>
          </div>
        )}

        {/* Preview */}
        {rows.length > 0 && !result && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-card sticky top-0 z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">OEM</th>
                    <th className="px-2 py-2">Başlık</th>
                    <th className="px-2 py-2">Araç</th>
                    <th className="px-2 py-2 text-right">Adet</th>
                    <th className="px-2 py-2 text-right">Fiyat</th>
                    <th className="px-2 py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr
                        key={r.__index}
                        className={`border-t border-border ${bad ? "bg-destructive/10" : r.duplicate ? "bg-amber-500/10" : ""}`}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">{r.__index}</td>
                        <td className="px-2 py-1.5 font-mono">{r.oem.join(", ") || "—"}</td>
                        <td className="px-2 py-1.5 max-w-[140px] truncate">{r.title || "—"}</td>
                        <td className="px-2 py-1.5">
                          {[r.vehicleBrand, r.vehicleModel, r.year].filter(Boolean).join(" ")}
                        </td>
                        <td className="px-2 py-1.5 text-right">{r.qty}</td>
                        <td className="px-2 py-1.5 text-right">{r.price != null ? `₺${r.price}` : "—"}</td>
                        <td className="px-2 py-1.5">
                          {bad ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertTriangle className="size-3" />
                              {r.errors[0]}
                            </span>
                          ) : r.duplicate ? (
                            <span className="text-amber-400">{r.warnings[0] ?? "Uyarı"}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="size-3" /> Hazır
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Submit */}
        {rows.length > 0 && !result && (
          <Button
            onClick={submit}
            disabled={submitting || valid.length === 0}
            className="w-full h-13 bg-gold-gradient text-gold-foreground font-semibold py-4"
          >
            {submitting ? "İşleniyor..." : `${valid.length} kaydı ${mode === "insert" ? "onaya gönder" : "güncelle"}`}
          </Button>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-4 space-y-2">
              <h2 className="font-display text-lg text-gold">Yükleme Tamamlandı</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-center">
                  <div className="text-2xl font-display text-emerald-400">{result.ok}</div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/80">Başarılı</div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-center">
                  <div className="text-2xl font-display text-destructive">{result.fail}</div>
                  <div className="text-[10px] uppercase tracking-wider text-destructive/80">Hatalı</div>
                </div>
              </div>
            </div>
            {result.details.length > 0 && (
              <div className="rounded-xl border border-border bg-card px-3 py-3 max-h-60 overflow-auto text-[11px] space-y-1">
                {result.details.map((d, i) => (
                  <div key={i} className="text-destructive">{d}</div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={reset} className="h-12">Yeni Dosya</Button>
              <Button onClick={() => nav({ to: "/account" })} className="h-12 bg-gold-gradient text-gold-foreground">
                İlanlarıma Git
              </Button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

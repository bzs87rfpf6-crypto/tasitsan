import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, ImageIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseOemList } from "@/lib/oem";
import { parsePartTypeFromExcel, type PartType } from "@/lib/part-type";
import { recordBulkArrival } from "@/lib/bulkNavTrace";
import { createBrowserId } from "@/lib/browser-compat";
import { useServerFn } from "@tanstack/react-start";
import { executeRecaptcha } from "@/lib/recaptcha";
import { verifyRecaptcha } from "@/lib/recaptcha.functions";

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
  "PARÇA TİPİ",
  "ÜRÜN DURUMU",
  "AÇIKLAMA",
  "FOTOĞRAFLAR",
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
  "parça tipi": "PARÇA TİPİ", "parca tipi": "PARÇA TİPİ", "tip": "PARÇA TİPİ", "tür": "PARÇA TİPİ", "tur": "PARÇA TİPİ", "part_type": "PARÇA TİPİ",
  "ürün durumu": "ÜRÜN DURUMU", "urun durumu": "ÜRÜN DURUMU", "durum": "ÜRÜN DURUMU", "condition": "ÜRÜN DURUMU", "kondisyon": "ÜRÜN DURUMU",
  "açıklama": "AÇIKLAMA", "aciklama": "AÇIKLAMA", "description": "AÇIKLAMA", "not": "AÇIKLAMA",
  "fotoğraflar": "FOTOĞRAFLAR", "fotograflar": "FOTOĞRAFLAR", "foto": "FOTOĞRAFLAR", "fotos": "FOTOĞRAFLAR",
  "photos": "FOTOĞRAFLAR", "photo": "FOTOĞRAFLAR", "resimler": "FOTOĞRAFLAR", "images": "FOTOĞRAFLAR",
};

type Condition = "new" | "used";

function parseCondition(raw: string): Condition {
  const k = raw.trim().toLowerCase();
  if (!k) return "used";
  if (/(sıfır|sifir|0|new|yeni)/.test(k)) return "new";
  return "used";
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  partType: PartType | null;
  condition: Condition;
  description: string;
  photoNames: string[];
  errors: string[];
  warnings: string[];
  duplicate?: boolean;
}

const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

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
    const partType = parsePartTypeFromExcel(get("PARÇA TİPİ"));
    const condition = parseCondition(get("ÜRÜN DURUMU"));
    const description = get("AÇIKLAMA");
    const photosRaw = get("FOTOĞRAFLAR");
    const photoNames = photosRaw
      ? photosRaw.split(/[;,|\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10)
      : [];

    const errors: string[] = [];
    if (oem.length === 0) errors.push("OEM NO eksik");
    if (!title) errors.push("PARÇA ADI eksik");
    if (!vehicleBrand) errors.push("ARAÇ MARKASI eksik");
    if (!vehicleModel) errors.push("ARAÇ MODELİ eksik");
    if (price == null || price <= 0) errors.push("FİYAT geçersiz");
    if (year && (year < 1950 || year > new Date().getFullYear() + 1)) errors.push("MODEL YILI geçersiz");
    const partTypeRaw = get("PARÇA TİPİ");
    const warnings: string[] = [];
    if (partTypeRaw && !partType) warnings.push(`PARÇA TİPİ tanınmadı: "${partTypeRaw}"`);

    return {
      __index: i + 2,
      oem, title, brand, vehicleBrand, vehicleModel, year, qty, price: price ?? null,
      partType, condition, description, photoNames, errors, warnings,
    };
  });
}

function BulkUploadPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("insert");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<{ whatsapp: string; city: string | null; approved: boolean } | null>(null);
  const [result, setResult] = useState<{
    ok: number; fail: number;
    matchedPhotos: number; unmatchedPhotos: string[]; unusedZipFiles: string[];
    errorDetails: string[];
  } | null>(null);
  const [zipName, setZipName] = useState("");
  // filename (lowercased basename) -> File
  const [zipFiles, setZipFiles] = useState<Map<string, File>>(new Map());
  const [navTrace, setNavTrace] = useState<{ ok: boolean; elapsedMs?: number } | null>(null);
  const [traceVisible, setTraceVisible] = useState(false);

  useEffect(() => {
    const result = recordBulkArrival();
    setNavTrace(result);
    const params = new URLSearchParams(window.location.search);
    setTraceVisible(params.get("trace") === "1");
    if (result.ok) {
      toast.success(`Sayfa açıldı (${result.elapsedMs ?? 0} ms)`, { duration: 2500 });
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, r] = await Promise.all([
        supabase.rpc("get_my_profile").maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      const pd = p.data as any;
      setProfile({
        whatsapp: pd?.whatsapp ?? "",
        city: pd?.city ?? null,
        approved: !!r.data || !!pd?.is_approved,
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
    const allOems = Array.from(new Set(rows.reduce<string[]>((acc, r) => acc.concat(r.oem), [])));
    if (allOems.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("parts")
        .select("oem_codes")
        .eq("seller_id", user.id)
        .overlaps("oem_codes", allOems);
      const dbOems = new Set((data ?? []).reduce<string[]>((acc, p) => acc.concat(p.oem_codes ?? []), []));
      setRows((prev) =>
        prev.map((r) => {
          const dupLocal = r.oem.some((c) => localDupOems.has(c));
          const dupDb = r.oem.some((c) => dbOems.has(c));
          const warnings: string[] = [...(r.warnings ?? []).filter((w) => w !== "Dosyada tekrar eden OEM" && w !== "Bu OEM ile mevcut ilanınız var")];
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

  const onZip = async (file: File) => {
    setZipName(file.name);
    try {
      const zip = await JSZip.loadAsync(file);
      const map = new Map<string, File>();
      const entries = Object.values(zip.files).filter((e) => !e.dir && IMAGE_EXT.test(e.name));
      if (entries.length === 0) {
        toast.error("ZIP içinde JPG/PNG/WebP bulunamadı.");
        return;
      }
      let skipped = 0;
      for (const entry of entries) {
        const blob = await entry.async("blob");
        if (blob.size > 10 * 1024 * 1024) { skipped++; continue; }
        const base = entry.name.split("/").pop()!.toLowerCase();
        const ext = base.split(".").pop()!.toLowerCase();
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        map.set(base, new File([blob], base, { type: mime }));
      }
      setZipFiles(map);
      toast.success(`${map.size} fotoğraf ZIP'ten alındı${skipped ? ` (${skipped} büyük dosya atlandı)` : ""}.`);
    } catch (e: any) {
      console.error("[bulk] zip parse failed", e);
      toast.error("ZIP açılamadı.");
    }
  };

  const downloadTemplate = () => {
    const data: (string | number)[][] = [
      [...HEADERS],
      ["A1234567890", "Sağ Far Komple", "Hella", "Mercedes", "W211", 2008, 1, 4500, "Orijinal", "İkinci El", "Çıkma, çiziksiz", "far1.jpg; far2.jpg"],
      ["B9876543210", "Sol Ön Çamurluk", "Orijinal", "BMW", "F30", 2015, 2, 2750, "Yan Sanayi", "Sıfır", "Yeni ürün", "camurluk-1.jpg"],
      ["329220K090", "Fren Balatası", "Bosch", "Toyota", "Hilux", 2018, 5, 850, "Eşdeğer", "Sıfır", "ZIP içindeki 329220K090.jpg otomatik eşleşir", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 16 },  // A: OEM NO
      { wch: 22 },  // B: PARÇA ADI
      { wch: 14 },  // C: MARKA
      { wch: 16 },  // D: ARAÇ MARKASI
      { wch: 16 },  // E: ARAÇ MODELİ
      { wch: 12 },  // F: MODEL YILI
      { wch: 8 },   // G: ADET
      { wch: 10 },  // H: FİYAT
      { wch: 14 },  // I: PARÇA TİPİ
      { wch: 14 },  // J: ÜRÜN DURUMU
      { wch: 30 },  // K: AÇIKLAMA
      { wch: 28 },  // L: FOTOĞRAFLAR
    ];

    // Data validation dropdowns
    (ws as any)["!dataValidation"] = [
      {
        sqref: "I2:I1000",
        type: "list",
        formula1: '"Orijinal,Eşdeğer,Yan Sanayi,Çıkma,Revizyonlu"',
        allowBlank: true,
        showDropDown: false,
        prompt: "Parça tipini seçiniz",
        promptTitle: "Parça Tipi",
      },
      {
        sqref: "J2:J1000",
        type: "list",
        formula1: '"Sıfır,İkinci El"',
        allowBlank: true,
        showDropDown: false,
        prompt: "Ürün durumunu seçiniz",
        promptTitle: "Ürün Durumu",
      },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parçalar");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tasitsan-toplu-parca-sablonu.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Şablon indirildi");
  };

  const valid = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalid = rows.length - valid.length;

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setZipName("");
    setZipFiles(new Map());
    if (fileRef.current) fileRef.current.value = "";
    if (zipRef.current) zipRef.current.value = "";
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
    let matchedPhotos = 0;
    const unmatchedPhotos: string[] = [];
    const errorDetails: string[] = [];
    const usedZipKeys = new Set<string>();

    // Pre-compute lookup maps from ZIP for OEM/title auto-matching.
    // Strategy: for each zip filename, derive its "stem" (basename without ext, lowercased,
    // suffix _\d+ stripped) — matches `329220K090.jpg`, `329220K090_1.jpg`, `Fren_Balatasi.jpg`.
    const zipByStem = new Map<string, string[]>(); // stem -> [zip keys] preserving order
    for (const key of zipFiles.keys()) {
      const base = key.replace(/\.[^.]+$/, "");
      const stem = base.replace(/[_-]?\d+$/, "");
      const norm = stem.toLowerCase();
      const arr = zipByStem.get(norm) ?? [];
      arr.push(key);
      zipByStem.set(norm, arr);
    }
    // Sort each bucket by filename so _1, _2 come in order.
    zipByStem.forEach((arr) => arr.sort());

    const resolveAutoMatches = (r: Row): string[] => {
      const keys: string[] = [];
      const tryStems: string[] = [];
      for (const oem of r.oem) tryStems.push(oem.toLowerCase());
      if (r.title) tryStems.push(slugify(r.title));
      for (const stem of tryStems) {
        const bucket = zipByStem.get(stem);
        if (bucket) {
          for (const k of bucket) if (!keys.includes(k)) keys.push(k);
        }
      }
      return keys.slice(0, 10);
    };

    for (const r of valid) {
      try {
        if (mode === "insert") {
          // Resolve photo source: explicit FOTOĞRAFLAR names take precedence; otherwise auto-match.
          const photoUrls: string[] = [];
          const missing: string[] = [];
          let zipKeys: string[] = [];
          if (r.photoNames.length > 0) {
            for (const name of r.photoNames.slice(0, 10)) {
              const key = name.toLowerCase();
              if (zipFiles.has(key)) zipKeys.push(key);
              else missing.push(name);
            }
          } else if (zipFiles.size > 0) {
            zipKeys = resolveAutoMatches(r);
          }

          for (const key of zipKeys) {
            const f = zipFiles.get(key);
            if (!f) continue;
            const { validateFile } = await import("@/lib/file-upload-validation");
            const v = await validateFile(f, "image");
            if (!v.ok) { missing.push(`${key} (${v.reason})`); continue; }
            const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
            const path = `${user.id}/${createBrowserId("photo")}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("part-photos")
              .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type || "image/jpeg" });
            if (upErr) { missing.push(`${key} (upload err)`); continue; }
            const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
            photoUrls.push(pub.publicUrl);
            usedZipKeys.add(key);
            matchedPhotos++;
          }
          if (missing.length > 0) unmatchedPhotos.push(`Satır ${r.__index}: ${missing.join(", ")}`);

          const { error } = await supabase.from("parts").insert({
            seller_id: user.id,
            title: r.title,
            description: r.description || null,
            brand: r.vehicleBrand || null,
            model: r.vehicleModel || null,
            year: r.year,
            oem_codes: r.oem,
            category: "Diğer",
            condition: r.condition,
            part_type: r.partType,
            price: r.price,
            stock_quantity: r.qty,
            city: profile.city,
            photos: photoUrls,
            whatsapp: profile.whatsapp,
            status: "pending",
          });
          if (error) throw error;
          ok++;
        } else {
          const { data: found } = await supabase
            .from("parts")
            .select("id")
            .eq("seller_id", user.id)
            .overlaps("oem_codes", r.oem)
            .limit(1)
            .maybeSingle();
          if (!found) {
            fail++;
            errorDetails.push(`Satır ${r.__index}: ${r.oem[0]} ile eşleşen ilan bulunamadı`);
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
                condition: r.condition,
                stock_quantity: r.qty,
              };
          const { error } = await supabase.from("parts").update(patch).eq("id", found.id);
          if (error) throw error;
          ok++;
        }
      } catch (e: any) {
        fail++;
        errorDetails.push(`Satır ${r.__index}: ${e?.message ?? "bilinmeyen hata"}`);
      }
    }

    const unusedZipFiles = Array.from(zipFiles.keys()).filter((k) => !usedZipKeys.has(k));
    setResult({ ok, fail, matchedPhotos, unmatchedPhotos, unusedZipFiles, errorDetails });
    setSubmitting(false);
    if (ok > 0) toast.success(`${ok} kayıt işlendi.`);
    if (fail > 0) toast.error(`${fail} kayıt başarısız.`);
  };

  // NOTE: Do NOT block the whole page on `loading || !user`. On PWA/Safari the
  // Supabase session restore can take seconds (or fail silently after expiry),
  // which leaves the page stuck on "Yükleniyor...". Instead render the UI
  // immediately; the submit handler and the redirect effect guard auth.
  const authPending = loading;
  const authMissing = !loading && !user;

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitle="Toplu Parça Yükle" />
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {traceVisible && (
          <div
            data-testid="bulk-nav-trace"
            className={`rounded-lg border px-3 py-2 text-xs font-mono ${
              navTrace?.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {navTrace?.ok
              ? `✓ /sell/bulk açıldı — tıklamadan ${navTrace.elapsedMs} ms sonra`
              : "ℹ Doğrudan açılış (önce buton tıklaması kaydedilmedi)"}
          </div>
        )}
        {(authPending || authMissing) && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${authMissing ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/30 text-muted-foreground"}`}>
            {authMissing ? "Oturumunuz sonlanmış görünüyor. Yüklemeden önce tekrar giriş yapın." : "Oturum doğrulanıyor..."}
          </div>
        )}
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
          {mode === "insert" && <><span className="text-gold font-semibold">Yeni İlan modu:</span> Her satır admin onayı için bekleyen yeni ilan olarak eklenir. <em>ÜRÜN DURUMU</em> sütununa "Sıfır" veya "İkinci El" yazın (boşsa "İkinci El" varsayılır). İsteğe bağlı bir ZIP yükleyin: <em>FOTOĞRAFLAR</em> sütununda dosya adı belirtilmezse <strong>OEM numarası</strong> (örn. <code>329220K090.jpg</code>, <code>329220K090_1.jpg</code>) veya <strong>parça adı</strong> (örn. <code>Fren_Balatasi.jpg</code>) ile otomatik eşleştirilir. İlan başına 1–10 fotoğraf.</>}
          {mode === "update" && <><span className="text-gold font-semibold">Toplu Güncelle:</span> OEM numarasına göre kendi ilanlarınızı bulur ve başlık, fiyat, stok dahil tüm alanları günceller.</>}
          {mode === "stock" && <><span className="text-gold font-semibold">Stok Güncelle:</span> Yalnızca ADET sütunu kullanılır; OEM eşleşen ilanlarınızın stok adedi güncellenir.</>}
        </div>

        {/* Template + Upload */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={downloadTemplate}
              className="h-14 border-gold/40 text-gold hover:bg-gold/10 text-sm font-semibold"
            >
              <Download className="size-5 mr-2" /> Örnek Şablon İndir
            </Button>
            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-14 bg-gold-gradient text-gold-foreground font-medium text-sm"
            >
              <Upload className="size-5 mr-2" /> Excel / CSV Seç
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Henüz dosyanız yok mu? Örnek şablonu indirip doldurun, ardından yükleyin.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {mode === "insert" && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => zipRef.current?.click()}
              className="h-11 w-full border-gold/40 text-gold hover:bg-gold/10"
            >
              <ImageIcon className="size-4 mr-2" /> Fotoğraf ZIP'i Seç (opsiyonel)
            </Button>
            <input
              ref={zipRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onZip(f);
                e.target.value = "";
              }}
            />
            {zipName && (
              <div className="text-[11px] text-muted-foreground px-1">
                {zipName} • {zipFiles.size} foto hazır
              </div>
            )}
          </div>
        )}

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
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/80">İşlenen Kayıt</div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-center">
                  <div className="text-2xl font-display text-destructive">{result.fail}</div>
                  <div className="text-[10px] uppercase tracking-wider text-destructive/80">Hatalı</div>
                </div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-3 text-center">
                  <div className="text-2xl font-display text-sky-300">{result.matchedPhotos}</div>
                  <div className="text-[10px] uppercase tracking-wider text-sky-300/80">Eşleşen Foto</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-center">
                  <div className="text-2xl font-display text-amber-300">{result.unusedZipFiles.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-300/80">Kullanılmayan ZIP</div>
                </div>
              </div>
            </div>
            {result.errorDetails.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-card px-3 py-3 max-h-48 overflow-auto text-[11px] space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1">Hatalı Satırlar</div>
                {result.errorDetails.map((d, i) => (
                  <div key={i} className="text-destructive">{d}</div>
                ))}
              </div>
            )}
            {result.unmatchedPhotos.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-card px-3 py-3 max-h-48 overflow-auto text-[11px] space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">Eşleşmeyen Fotoğraflar</div>
                {result.unmatchedPhotos.map((d, i) => (
                  <div key={i} className="text-amber-300/90">{d}</div>
                ))}
              </div>
            )}
            {result.unusedZipFiles.length > 0 && (
              <div className="rounded-xl border border-border bg-card px-3 py-3 max-h-40 overflow-auto text-[11px] space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">ZIP'te Kullanılmayan Dosyalar</div>
                {result.unusedZipFiles.map((d, i) => (
                  <div key={i} className="text-muted-foreground font-mono">{d}</div>
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

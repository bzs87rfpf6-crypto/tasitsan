import { Link } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { slugifyOem } from "@/lib/part-slug";

interface OemBoxProps {
  oemCodes: string[];
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  engineCode?: string | null;
  equivalents?: string[];
}

/**
 * OEM bilgi kutusu — ürün açıklamasının başında SEO için OEM, marka, uyumlu
 * araç ve eşdeğer kodları gösterir. Her OEM /oem/{code} sayfasına link.
 */
export function OemBox({ oemCodes, brand, model, year, engineCode, equivalents = [] }: OemBoxProps) {
  if (oemCodes.length === 0) return null;
  const compat = [brand, model, year].filter(Boolean).join(" ");
  return (
    <div className="bg-card rounded-xl p-4 border border-gold/40 space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="size-4 text-gold" />
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">OEM Bilgi Kutusu</h2>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">OEM No</dt>
          <dd className="font-mono text-sm font-semibold mt-0.5 flex flex-wrap gap-1.5">
            {oemCodes.map((c) => (
              <Link
                key={c}
                to="/oem/$oem"
                params={{ oem: slugifyOem(c) }}
                className="px-2 py-0.5 rounded bg-background border border-gold/40 text-gold hover:bg-gold/10 transition"
              >
                {c}
              </Link>
            ))}
          </dd>
        </div>
        {brand && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Marka</dt>
            <dd className="font-semibold mt-0.5">{brand}</dd>
          </div>
        )}
        {compat && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Uyumlu Araç</dt>
            <dd className="font-semibold mt-0.5">{compat}</dd>
          </div>
        )}
        {engineCode && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Motor Kodu</dt>
            <dd className="font-mono mt-0.5">{engineCode}</dd>
          </div>
        )}
      </dl>
      {equivalents.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1.5">Eşdeğer OEM'ler</div>
          <div className="flex flex-wrap gap-1.5">
            {equivalents.slice(0, 10).map((c) => (
              <Link
                key={c}
                to="/oem/$oem"
                params={{ oem: slugifyOem(c) }}
                className="font-mono text-[11px] px-2 py-0.5 rounded bg-background border border-border text-muted-foreground hover:border-gold/60 hover:text-gold transition"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

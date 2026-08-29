// Satılan ürünlerde "Sepete Ekle" yerine gösterilen aksiyonlar.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellPlus, Layers } from "lucide-react";
import { SoldRequestDialog, type SoldRequestPart } from "@/components/SoldRequestDialog";
import { trackEvent } from "@/lib/analytics";

export function similarSearchParams(part: SoldRequestPart) {
  const oem = part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? "";
  if (oem) return { oem, sold: "0" as const };
  const q = [part.brand, part.model, part.title].filter(Boolean).join(" ").slice(0, 80);
  return { q, sold: "0" as const };
}

export function SoldActions({
  part, size = "md", className = "",
}: {
  part: SoldRequestPart;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const h = size === "sm" ? "h-8 text-[11px]" : "h-11 text-sm";

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          trackEvent("sold_request_open", { part_id: part.id, oem: part.oem_code ?? null });
          setOpen(true);
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold hover:bg-emerald-500/20 active:scale-[0.98] transition ${h}`}
      >
        <BellPlus className="size-3.5" /> Talep Oluştur
      </button>
      <Link
        to="/parts"
        search={similarSearchParams(part) as never}
        onClick={(e) => {
          e.stopPropagation();
          trackEvent("sold_similar_click", { part_id: part.id, oem: part.oem_code ?? null });
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/50 bg-sky-500/10 text-sky-400 font-semibold hover:bg-sky-500/20 active:scale-[0.98] transition ${h}`}
      >
        <Layers className="size-3.5" /> Benzer Ürünler
      </Link>
      <div onClick={(e) => e.preventDefault()}>
        <SoldRequestDialog open={open} onOpenChange={setOpen} part={part} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SafePartImage } from "@/components/SafePartImage";
import { PartTypeBadge } from "@/components/PartTypeBadge";
import { normalizeOem } from "@/lib/oem";

type Match = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  oem_code: string | null;
  part_type: string | null;
  stock_quantity: number | null;
};

export function OemQueryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [oem, setOem] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [rows, setRows] = useState<Match[]>([]);

  const reset = () => { setOem(""); setRows([]); setSearched(false); };

  const run = async () => {
    const norm = normalizeOem(oem).replace(/[-./]/g, "");
    if (norm.length < 3) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await supabase.rpc("search_parts_by_oem", { _oem: norm });
      setRows(((data ?? []) as unknown as Match[]).slice(0, 50));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🔎</span> OEM Sorgula
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            OEM kodu girin — boşluk, tire ve nokta otomatik normalize edilir. Hem birincil OEM hem eşdeğer OEM kodlarında arar.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={oem}
              onChange={(e) => setOem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Örn. 90366-T0061"
              className="pl-9 pr-9 h-12 font-mono uppercase"
            />
            {oem && (
              <button onClick={() => setOem("")} className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full grid place-items-center hover:bg-muted">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button onClick={run} disabled={loading || normalizeOem(oem).replace(/[-./]/g, "").length < 3} className="w-full bg-gold-gradient text-gold-foreground font-semibold">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Stokları Listele"}
          </Button>

          {searched && !loading && rows.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Bu OEM koduyla eşleşen ilan bulunamadı.
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{rows.length} eşleşme</p>
              <div className="grid grid-cols-2 gap-2">
                {rows.map((r) => (
                  <Link
                    key={r.id}
                    to="/parts/$id"
                    params={{ id: r.id }}
                    onClick={() => onOpenChange(false)}
                    className="block rounded-xl overflow-hidden border border-border bg-card hover:border-gold/60 transition"
                  >
                    <div className="aspect-square bg-secondary">
                      <SafePartImage images={r.photos} alt={r.title} width={240} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-semibold line-clamp-2">{r.title}</p>
                      {r.oem_code && <p className="text-[10px] font-mono text-muted-foreground truncate">{r.oem_code}</p>}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-gold">
                          {r.price ? `${r.price.toLocaleString("tr-TR")} ₺` : "—"}
                        </span>
                        {r.part_type && <PartTypeBadge value={r.part_type} />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{r.city ?? ""}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin: OEM Görsel Havuzu Debug
 *
 * Belirli bir OEM kodunun çözümlenmesini gösterir:
 *  - Normalize edilmiş hali
 *  - OEM Havuzunda bulundu mu (birebir/normalize)
 *  - Hangi görsel ve hangi kaynak kullanıldı
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Search, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOem } from "@/lib/oem-normalize";

interface LookupRow {
  image_url: string;
  oem: string | null;
  oem_normalized: string | null;
  is_primary: boolean | null;
  confidence: number | null;
  source_name: string | null;
  verified: boolean | null;
  source_type: string | null;
  created_at: string | null;
}

export function OemImageResolverDebugPanel() {
  const [input, setInput] = useState("49110-VK513");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LookupRow[] | null>(null);
  const [crossRows, setCrossRows] = useState<LookupRow[] | null>(null);
  const [equivalents, setEquivalents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const raw = input.trim();
  const norm = normalizeOem(raw);

  const lookup = async () => {
    if (!norm) return;
    setLoading(true);
    setError(null);
    setRows(null);
    setCrossRows(null);
    setEquivalents([]);
    try {
      const { data, error } = await supabase
        .from("oem_image_library")
        .select("image_url,oem,oem_normalized,is_primary,confidence,source_name,verified,source_type,created_at")
        .eq("oem_normalized", norm)
        .order("is_primary", { ascending: false })
        .order("confidence", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      const direct = (data ?? []) as LookupRow[];
      setRows(direct);

      // Cross reference fallback when no direct hit
      if (direct.length === 0) {
        const { data: eqs } = await supabase.rpc(
          "find_oem_equivalents" as never,
          { _oem_normalized: norm } as never,
        );
        const equivNorms = Array.from(
          new Set(
            ((eqs ?? []) as Array<{ equivalent_normalized?: string | null }>)
              .map((e) => e.equivalent_normalized)
              .filter((v): v is string => !!v && v !== norm),
          ),
        );
        setEquivalents(equivNorms);
        if (equivNorms.length > 0) {
          const { data: viaData } = await supabase
            .from("oem_image_library")
            .select("image_url,oem,oem_normalized,is_primary,confidence,source_name,verified,source_type,created_at")
            .in("oem_normalized", equivNorms)
            .order("is_primary", { ascending: false })
            .order("confidence", { ascending: false })
            .limit(20);
          setCrossRows((viaData ?? []) as LookupRow[]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup hatası");
    } finally {
      setLoading(false);
    }
  };

  const exactRow = rows?.find((r) => (r.oem ?? "").toUpperCase() === raw.toUpperCase()) ?? null;
  const normRow = rows && rows.length > 0 ? rows[0] : null;
  const crossRow = crossRows && crossRows.length > 0 ? crossRows[0] : null;
  const picked = exactRow ?? normRow ?? crossRow;
  const matchType: "exact" | "normalized" | "cross_reference" | null = !picked
    ? null
    : exactRow ? "exact" : normRow ? "normalized" : "cross_reference";
  const sourceLabel = !picked
    ? "Marka logosu (fallback)"
    : matchType === "exact"
      ? "OEM Havuzu — birebir eşleşme"
      : matchType === "normalized"
        ? "OEM Havuzu — normalize edilmiş eşleşme"
        : "OEM Havuzu — muadil / cross reference";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="size-4" /> OEM Görsel Çözücü — Debug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Görsel seçim sırası: <strong>1)</strong> parts.photos &nbsp;→&nbsp;
          <strong>2)</strong> Havuz birebir &nbsp;→&nbsp;
          <strong>3)</strong> Havuz normalize &nbsp;→&nbsp;
          <strong>4)</strong> Marka logosu
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label htmlFor="oem-debug" className="text-xs">Ürün OEM</Label>
            <Input
              id="oem-debug" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="örn. 49110-VK513"
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
            />
          </div>
          <div className="self-end">
            <Button onClick={lookup} disabled={loading || !norm} size="sm">
              <Search className="size-4" />
              <span className="ml-1">{loading ? "Aranıyor…" : "Çöz"}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Row label="Ürün OEM" value={<code className="font-mono">{raw || "—"}</code>} />
          <Row label="Normalize" value={<code className="font-mono">{norm || "—"}</code>} />
          <Row
            label="OEM Havuzunda bulundu"
            value={
              rows == null
                ? "—"
                : picked
                  ? <Badge variant="default">Evet ({matchType})</Badge>
                  : <Badge variant="outline">Hayır</Badge>
            }
          />
          <Row label="Toplam eşleşen kayıt" value={rows?.length ?? "—"} />
          <Row label="Muadil OEM (cross-ref)" value={equivalents.length > 0 ? equivalents.join(", ") : "—"} />
          <Row label="Kullanılan kaynak" value={<span className="font-medium">{sourceLabel}</span>} />
          <Row
            label="Bulunan görsel URL"
            value={picked ? (
              <a href={picked.image_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate inline-block max-w-full">
                {picked.image_url}
              </a>
            ) : "—"}
          />
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {picked && (
          <div className="rounded border p-3 flex gap-3 items-start">
            <img src={picked.image_url} alt="" className="w-32 h-32 object-cover rounded bg-muted shrink-0" />
            <div className="text-xs space-y-1 min-w-0">
              <div><span className="text-muted-foreground">oem:</span> <code>{picked.oem}</code></div>
              <div><span className="text-muted-foreground">oem_normalized:</span> <code>{picked.oem_normalized}</code></div>
              <div><span className="text-muted-foreground">source_type:</span> {picked.source_type}</div>
              <div className="break-all"><span className="text-muted-foreground">source_name:</span> {picked.source_name}</div>
              <div><span className="text-muted-foreground">confidence:</span> {picked.confidence} · <span className="text-muted-foreground">verified:</span> {String(picked.verified)} · <span className="text-muted-foreground">primary:</span> {String(picked.is_primary)}</div>
            </div>
          </div>
        )}

        {rows && rows.length > 1 && (
          <div className="pt-2 border-t">
            <div className="text-xs font-medium mb-1">Diğer eşleşmeler ({rows.length - 1})</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {rows.slice(1).map((r) => (
                <a key={r.image_url} href={r.image_url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={r.image_url} alt="" className="w-full aspect-square object-cover rounded bg-muted" />
                  <div className="text-[10px] text-muted-foreground mt-1 truncate">{r.oem}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

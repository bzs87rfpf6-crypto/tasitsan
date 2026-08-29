import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminEditRecord } from "@/lib/admin-moderation.functions";

type Scope = "requests" | "quotes";

const REQUEST_FIELDS: Array<{ key: string; label: string; type?: "number" | "textarea" }> = [
  { key: "part_name", label: "Parça adı" },
  { key: "brand", label: "Marka" },
  { key: "model", label: "Model" },
  { key: "year", label: "Yıl", type: "number" },
  { key: "oem_code", label: "OEM" },
  { key: "city", label: "Şehir" },
  { key: "category", label: "Kategori" },
  { key: "full_name", label: "İletişim adı" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-posta" },
  { key: "status", label: "Durum (new/in_progress/resolved/closed)" },
  { key: "notes", label: "Notlar", type: "textarea" },
  { key: "description", label: "Açıklama", type: "textarea" },
];

const QUOTE_FIELDS: Array<{ key: string; label: string; type?: "number" | "textarea" }> = [
  { key: "price", label: "Fiyat (₺)", type: "number" },
  { key: "delivery_time", label: "Teslim süresi" },
  { key: "condition", label: "Durum (yeni/2.el/...)" },
  { key: "status", label: "Durum (pending/approved/rejected)" },
  { key: "note", label: "Not", type: "textarea" },
];

export function RecordEditDialog({
  open,
  onOpenChange,
  scope,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: Scope;
  row: Record<string, any> | null;
  onSaved: () => void;
}) {
  const editFn = useServerFn(adminEditRecord);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fields = scope === "requests" ? REQUEST_FIELDS : QUOTE_FIELDS;

  useEffect(() => {
    if (row) {
      const init: Record<string, any> = {};
      for (const f of fields) init[f.key] = row[f.key] ?? "";
      setForm(init);
    }
  }, [row, scope]);

  if (!row) return null;

  async function save() {
    if (!row) return;
    const patch: Record<string, any> = {};
    for (const f of fields) {
      const v = form[f.key];
      const orig = row[f.key] ?? "";
      if (String(v ?? "") === String(orig ?? "")) continue;
      if (v === "" || v === null) continue;
      if (f.type === "number") {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        patch[f.key] = n;
      } else {
        patch[f.key] = String(v);
      }
    }
    if (Object.keys(patch).length === 0) {
      toast.info("Değişiklik yok");
      return;
    }
    setSaving(true);
    try {
      await editFn({ data: { scope, id: row.id, patch } });
      toast.success("Kayıt güncellendi");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scope === "requests" ? "Talebi düzenle" : "Teklifi düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  rows={3}
                  className="text-sm"
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-9 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-3 mr-1 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordViewDialog({
  open,
  onOpenChange,
  scope,
  row,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: Scope;
  row: Record<string, any> | null;
}) {
  if (!row) return null;
  const entries = Object.entries(row).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scope === "requests" ? "Talep detayı" : "Teklif detayı"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-2 text-xs border-b border-border/40 pb-1.5">
              <span className="text-muted-foreground font-medium">{k}</span>
              <span className="col-span-2 break-words">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

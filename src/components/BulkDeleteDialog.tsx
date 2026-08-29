import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  /** Ek açıklama (ör. "14 Ağustos 2026 yüklemesi"). */
  context?: string;
  busy?: boolean;
  progress?: { processed: number; total: number } | null;
  onConfirm: () => void;
}

/**
 * İki aşamalı onay: kullanıcı önce "Sil" der, ardından ürün adedini
 * yazarak/onaylayarak ikinci kez teyit eder.
 */
export function BulkDeleteDialog({ open, onOpenChange, count, context, busy, progress, onConfirm }: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const fmt = count.toLocaleString("tr-TR");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" /> {fmt} ürün silinecek
          </DialogTitle>
          <DialogDescription className="text-left">
            {context && <span className="block text-foreground font-medium mb-1">{context}</span>}
            {step === 1
              ? "Bu işlem seçilen ürünleri kalıcı olarak kaldıracaktır. Devam etmek istediğinize emin misiniz?"
              : "Son onay: bu işlem geri alınamaz. Ürünler ve bağlı görselleri kalıcı olarak silinecek."}
          </DialogDescription>
        </DialogHeader>

        {busy && progress && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-destructive transition-all"
                style={{ width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              {progress.processed.toLocaleString("tr-TR")} / {progress.total.toLocaleString("tr-TR")} ürün işleniyor
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          {step === 1 ? (
            <Button type="button" variant="destructive" disabled={busy || count === 0} onClick={() => setStep(2)}>
              <Trash2 className="size-4 mr-1.5" /> {fmt} Ürünü Sil
            </Button>
          ) : (
            <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
              {busy ? "Siliniyor..." : `Evet, ${fmt} ürünü kalıcı olarak sil`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

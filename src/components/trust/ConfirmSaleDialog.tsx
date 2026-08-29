import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmSale } from "@/lib/trust.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partId: string;
  partTitle?: string;
  onDone?: () => void;
}

/** Satıcının bu ilan için alıcıyı seçip "Satış tamamlandı" onayı vermesi */
export function ConfirmSaleDialog({ open, onOpenChange, partId, partTitle, onDone }: Props) {
  const confirm = useServerFn(confirmSale);
  const [inquiries, setInquiries] = useState<Array<{ buyer_id: string; full_name: string; phone: string; created_at: string }>>([]);
  const [buyerId, setBuyerId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("inquiries")
        .select("buyer_id,full_name,phone,created_at")
        .eq("part_id", partId)
        .not("buyer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setInquiries((data ?? []) as any);
    })();
  }, [open, partId]);

  async function save() {
    if (!buyerId) { toast.error("Alıcıyı seçin"); return; }
    setSaving(true);
    try {
      await confirm({ data: { partId, buyerId, note: note || undefined } });
      toast.success("Satış onaylandı — alıcı artık yorum yazabilir");
      onOpenChange(false);
      onDone?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Satışı Onayla</DialogTitle>
          <DialogDescription className="text-xs">
            {partTitle ? `"${partTitle}" için satışın tamamlandığını onaylayın.` : "Satışın tamamlandığını onaylayın."}
            Onayladığınız alıcı bu ürüne doğrulanmış yorum yazabilir.
          </DialogDescription>
        </DialogHeader>

        {inquiries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Bu ilana giriş yapmış bir alıcı henüz teklif göndermemiş. Alıcı önce siteye üye olarak size teklif göndermelidir.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {inquiries.map((q) => (
              <label key={q.buyer_id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${buyerId === q.buyer_id ? "border-gold bg-gold/5" : "border-border"}`}>
                <input type="radio" name="buyer" checked={buyerId === q.buyer_id} onChange={() => setBuyerId(q.buyer_id)} />
                <div className="text-xs flex-1 min-w-0">
                  <div className="font-semibold truncate">{q.full_name}</div>
                  <div className="text-muted-foreground truncate">{q.phone}</div>
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(q.created_at).toLocaleDateString("tr-TR")}</span>
              </label>
            ))}
          </div>
        )}

        <Input placeholder="Not (isteğe bağlı, sadece kayıt)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={save} disabled={saving || !buyerId}
          className="w-full h-11 bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
          {saving ? "Kaydediliyor…" : "Satışı Onayla"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

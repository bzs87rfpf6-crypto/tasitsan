// Faz 4/6 — Sonuçsuz aramada: alarma abone ol.
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { subscribePartAlert } from "@/lib/ai-alerts.functions";
import { Button } from "@/components/ui/button";
import { BellPlus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

interface Props {
  keyword?: string | null;
  brand?: string | null;
  model?: string | null;
  oem_code?: string | null;
  category?: string | null;
  logId?: string | null;
}

export function AiAlertSubscribe(p: Props) {
  const run = useServerFn(subscribePartAlert);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  async function subscribe() {
    setSaving(true);
    try {
      await run({ data: {
        keyword: p.keyword ?? null,
        brand: p.brand ?? null,
        model: p.model ?? null,
        oem_code: p.oem_code ?? null,
        category: p.category ?? null,
        ai_log_id: p.logId ?? null,
      }});
      setDone(true);
      trackEvent("ai_alert_subscribed", { oem: p.oem_code, brand: p.brand, model: p.model });
      toast.success("Alarm kuruldu. Uygun ürün eklenince haber vereceğiz.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Alarm kurulamadı");
    } finally { setSaving(false); }
  }

  if (done) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
        <Check className="size-3.5" /> Alarm kuruldu
      </div>
    );
  }

  if (signedIn === false) {
    return (
      <a href="/auth" rel="nofollow" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10">
        <BellPlus className="size-3.5" /> Giriş yap & alarm kur
      </a>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={subscribe} disabled={saving} className="text-xs">
      {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <BellPlus className="size-3.5 mr-1" />}
      Bu parça eklenince haber ver
    </Button>
  );
}

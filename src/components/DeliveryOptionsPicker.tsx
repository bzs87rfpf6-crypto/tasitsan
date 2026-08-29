import { Flame } from "lucide-react";
import { DELIVERY_OPTIONS, type DeliveryOption } from "@/lib/delivery-options";

interface Props {
  value: DeliveryOption[];
  onChange: (next: DeliveryOption[]) => void;
  urgent: boolean;
  onUrgentChange: (next: boolean) => void;
}

export function DeliveryOptionsPicker({ value, onChange, urgent, onUrgentChange }: Props) {
  const toggle = (v: DeliveryOption) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">
          Teslimat Seçenekleri
        </label>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_OPTIONS.map((o) => {
            const active = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                title={o.description}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? "bg-gold-gradient text-gold-foreground border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span aria-hidden>{o.emoji}</span>
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Birden fazla seçebilirsiniz. Seçtikleriniz ürün kartında ve detayda gösterilir.
        </p>
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => onUrgentChange(e.target.checked)}
          className="mt-0.5 size-4 accent-orange-500"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-300">
            <Flame className="size-4" /> Acil Teslimata Uygun
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Bu ürün aynı gün kargoya verilebilir veya otobüs kargo ile acil gönderilebilir.
          </p>
        </div>
      </label>
    </div>
  );
}

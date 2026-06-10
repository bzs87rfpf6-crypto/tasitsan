import { translateError } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Save, Loader2, ShieldCheck, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listBotRules, createBotRule, updateBotRule, deleteBotRule,
  type BotRule,
} from "@/lib/bot-filter.functions";

export function BotFilterPanel() {
  const list = useServerFn(listBotRules);
  const create = useServerFn(createBotRule);
  const update = useServerFn(updateBotRule);
  const remove = useServerFn(deleteBotRule);

  const [rules, setRules] = useState<BotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pattern, setPattern] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRules(await list()); }
    catch (e) { toast.error(translateError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = pattern.trim();
    if (!p) return;
    setAdding(true);
    try {
      await create({ data: { pattern: p, label: label.trim() || null } });
      setPattern(""); setLabel("");
      toast.success("Kural eklendi");
      await load();
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (r: BotRule) => {
    setBusy(r.id);
    try {
      await update({ data: { id: r.id, enabled: !r.enabled } });
      setRules((prev) => prev.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    } catch (e) { toast.error(translateError(e)); }
    finally { setBusy(null); }
  };

  const del = async (r: BotRule) => {
    if (!confirm(`"${r.pattern}" kuralı silinsin mi?`)) return;
    setBusy(r.id);
    try {
      await remove({ data: { id: r.id } });
      setRules((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Silindi");
    } catch (e) { toast.error(translateError(e)); }
    finally { setBusy(null); }
  };

  const saveLabel = async (r: BotRule, newLabel: string) => {
    if ((r.label ?? "") === newLabel) return;
    setBusy(r.id);
    try {
      await update({ data: { id: r.id, label: newLabel || null } });
      setRules((prev) => prev.map((x) => x.id === r.id ? { ...x, label: newLabel || null } : x));
    } catch (e) { toast.error(translateError(e)); }
    finally { setBusy(null); }
  };

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="size-4 text-gold" />
          <h2 className="text-sm font-semibold">Bot ve Crawler Filtreleri</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Burada listelenen User-Agent kalıpları analitik istatistiklerine dahil edilmez.
          Hem yeni ziyaretçi kayıtlarında hem de yönetici panelindeki raporlamada uygulanır.
          {" "}<span className="text-gold font-semibold">{activeCount}/{rules.length}</span> kural aktif.
        </p>
      </div>

      <form onSubmit={handleAdd} className="bg-card rounded-xl border border-border p-3 sm:p-4 space-y-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <Plus className="size-3.5" /> Yeni kural ekle
        </h3>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Örn: customcrawler"
            maxLength={200}
            required
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Açıklama (opsiyonel)"
            maxLength={120}
          />
          <Button type="submit" disabled={adding || !pattern.trim()} className="bg-gold-gradient text-gold-foreground">
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Ekle
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Kalıp, kullanıcı tarayıcı bilgisi (User-Agent) içinde aranır. Büyük/küçük harfe duyarsızdır.
          Özel karakterler otomatik olarak güvenli hale getirilir.
        </p>
      </form>

      <div className="bg-card rounded-xl border border-border">
        <div className="px-3 sm:px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold">Tanımlı Kurallar</h3>
          <span className="text-[11px] text-muted-foreground">{rules.length} kayıt</span>
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground text-xs py-8">Yükleniyor...</p>
        ) : rules.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-8">Henüz kural yok.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                busy={busy === r.id}
                onToggle={() => toggle(r)}
                onDelete={() => del(r)}
                onSaveLabel={(v) => saveLabel(r, v)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RuleRow({
  rule, busy, onToggle, onDelete, onSaveLabel,
}: {
  rule: BotRule;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSaveLabel: (v: string) => void;
}) {
  const [label, setLabel] = useState(rule.label ?? "");
  const dirty = (rule.label ?? "") !== label;

  useEffect(() => { setLabel(rule.label ?? ""); }, [rule.label]);

  return (
    <li className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onToggle}
          disabled={busy}
          aria-label={rule.enabled ? "Devre dışı bırak" : "Etkinleştir"}
          className={`size-6 rounded-full grid place-items-center border transition-colors ${
            rule.enabled
              ? "bg-gold-gradient text-gold-foreground border-transparent"
              : "border-border text-muted-foreground"
          }`}
        >
          <Power className="size-3" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-mono font-semibold truncate">{rule.pattern}</code>
            {rule.is_default && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-0.5">
                <ShieldCheck className="size-2.5" /> varsayılan
              </span>
            )}
            {!rule.enabled && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">Kapalı</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="açıklama"
          maxLength={120}
          className="h-8 text-xs w-36 sm:w-44"
        />
        {dirty && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSaveLabel(label)} className="h-8 px-2">
            <Save className="size-3.5" />
          </Button>
        )}
        {!rule.is_default && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="h-8 px-2 text-destructive hover:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

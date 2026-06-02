import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeOem, parseOemList } from "@/lib/oem";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
  required?: boolean;
}

export function OemInput({ value, onChange, max = 10, placeholder, required }: Props) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parsed = parseOemList(raw);
    if (parsed.length === 0) return;
    const merged = Array.from(new Set([...value, ...parsed])).slice(0, max);
    onChange(merged);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
      if (draft.trim().length === 0) return;
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-mono text-gold"
            >
              {code}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== code))}
                className="grid size-4 place-items-center rounded-full hover:bg-gold/20"
                aria-label={`${code} kodunu kaldır`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(normalizeOem(e.target.value))}
        onKeyDown={onKeyDown}
        onBlur={() => draft && commit(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[\s,;\n]/.test(text)) {
            e.preventDefault();
            commit(text);
          }
        }}
        placeholder={placeholder ?? "OEM numarası gir, Enter veya virgülle ekle"}
        maxLength={60}
        required={required && value.length === 0}
        className="h-12 bg-card font-mono"
      />
      <p className="text-[10px] text-muted-foreground">
        {value.length}/{max} • Birden fazla OEM ekleyebilirsiniz. Eşdeğer parçalar bu kodlara göre eşleştirilir.
      </p>
    </div>
  );
}

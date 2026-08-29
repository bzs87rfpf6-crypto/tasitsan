// Sohbet istihbaratı yardımcıları (yalnızca sunucu).
export type UaInfo = { browser: string; os: string; device: string };

export function parseUa(ua: string | null | undefined): UaInfo {
  const s = ua ?? "";
  const browser =
    /Edg\//i.test(s) ? "Edge"
    : /OPR\/|Opera/i.test(s) ? "Opera"
    : /SamsungBrowser/i.test(s) ? "Samsung Internet"
    : /Chrome\//i.test(s) ? "Chrome"
    : /Firefox\//i.test(s) ? "Firefox"
    : /Safari\//i.test(s) ? "Safari"
    : s ? "Diğer" : "—";
  const os =
    /Windows NT/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iOS/i.test(s) ? "iOS"
    : /Mac OS X/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : s ? "Diğer" : "—";
  const device =
    /iPad|Tablet/i.test(s) ? "tablet"
    : /Mobi|Android|iPhone/i.test(s) ? "mobile"
    : s ? "desktop" : "—";
  return { browser, os, device };
}

/** IP'yi gizlenmiş biçimde döner: 88.240.xxx.xxx */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const p = ip.split(":").filter(Boolean);
    return `${p.slice(0, 2).join(":")}:xxxx:xxxx`;
  }
  const p = ip.split(".");
  if (p.length !== 4) return "gizli";
  return `${p[0]}.${p[1]}.xxx.xxx`;
}

export function sourceOf(referrer: string | null | undefined, path?: string | null): string {
  const r = (referrer ?? "").toLowerCase();
  const p = (path ?? "").toLowerCase();
  if (/utm_source=facebook|fbclid/.test(p) || /facebook|fb\.com|instagram/.test(r)) return "Facebook";
  if (/gclid|utm_source=google/.test(p) || /google\./.test(r)) return "Google";
  if (/utm_source=/.test(p)) {
    const m = p.match(/utm_source=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  if (/bing\./.test(r)) return "Bing";
  if (/yandex\./.test(r)) return "Yandex";
  if (/t\.co|twitter|x\.com/.test(r)) return "X";
  if (/whatsapp/.test(r)) return "WhatsApp";
  if (!r) return "Organik";
  if (/tasitsan/.test(r)) return "Site içi";
  return "Yönlendirme";
}

export type ChatMsg = { role: "user" | "assistant"; content: string; ts?: string | null };

export function normalizeMessages(raw: unknown): ChatMsg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const role = o["role"] === "assistant" ? "assistant" : "user";
      const content = typeof o["content"] === "string" ? o["content"] : "";
      const ts = typeof o["ts"] === "string" ? o["ts"] : null;
      return { role, content, ts } as ChatMsg;
    })
    .filter((m) => m.content.length > 0);
}

const OEM_RE = /\b[0-9A-Z]{2,}[-0-9A-Z ]{3,}\b/g;

export function extractOems(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toUpperCase().match(OEM_RE) ?? []) {
    const v = m.replace(/\s+/g, " ").trim();
    if (v.replace(/[^0-9]/g, "").length >= 4 && v.length <= 24) out.add(v);
  }
  return Array.from(out).slice(0, 5);
}

export type ChatAnalysis = {
  summary: string;
  outcome: "converted" | "engaged" | "abandoned" | "unknown";
  oems: string[];
  demand_hits: number;
  recommendation: string;
};

export function buildAnalysis(input: {
  messages: ChatMsg[];
  postEvents: { event_type: string }[];
  durationMin: number;
  demandHits: number;
  oems: string[];
  productsShown: number;
  /** Sohbetten önce aynı oturumda görüntülenen ürün sayısı. */
  productsShownBefore?: number;
  /** Oturumdaki toplam analytics olayı — 0 ise kanıt yok demektir. */
  sessionEventCount?: number;
}): ChatAnalysis {
  const userText = input.messages.filter((m) => m.role === "user").map((m) => m.content).join(" · ");
  const types = new Set(input.postEvents.map((e) => e.event_type));
  const converted = types.has("order_created");
  const engaged = types.has("part_view") || types.has("click_whatsapp") || types.has("click_call") || types.has("buy_button_clicked");
  const before = input.productsShownBefore ?? 0;
  const totalViews = input.productsShown + before;
  const noEvidence = (input.sessionEventCount ?? 0) === 0;
  const outcome: ChatAnalysis["outcome"] = converted ? "converted" : engaged ? "engaged" : input.messages.length ? "abandoned" : "unknown";

  const parts: string[] = [];
  parts.push(`Müşteri "${userText.slice(0, 140) || "—"}" konusunda destek istedi.`);
  if (noEvidence) {
    parts.push("Bu oturum için davranış verisi kaydedilmemiş; ürün görüntülemesi hakkında kesin bir şey söylenemez.");
  } else if (input.productsShown > 0) {
    parts.push(
      before > 0
        ? `Sohbet öncesinde ${before}, sohbet sonrasında ${input.productsShown} ürün görüntülendi.`
        : `Sohbet sonrası ${input.productsShown} ürün görüntülendi.`,
    );
  } else if (before > 0) {
    parts.push(`Sohbet sonrası yeni ürün görüntülemesi yok; ancak müşteri sohbetten önce aynı oturumda ${before} ürün görüntülemişti.`);
  } else {
    parts.push("Bu oturumda kayıtlı ürün görüntülemesi bulunmuyor (ürünün bulunmadığı anlamına gelmez).");
  }
  if (converted) parts.push("Bu oturum siparişe dönüştü.");
  else if (engaged) parts.push("Müşteri iletişim/ürün adımına geçti ancak sipariş oluşturmadı.");
  else if (!noEvidence) parts.push(`Müşteri sohbetten ${Math.max(1, Math.round(input.durationMin))} dakika sonra siteden ayrıldı.`);
  if (input.oems.length) {
    parts.push(`Konuşulan kod(lar): ${input.oems.join(", ")}. Son 30 günde ${input.demandHits} kez arandı.`);
  }

  const recommendation = converted
    ? "Aksiyon gerekmiyor — dönüşüm sağlandı."
    : input.demandHits >= 5
      ? "Bu koda ait stok eklenmesi önerilir; talep yüksek."
      : noEvidence
        ? "Davranış verisi yok; sonuç için analytics kaydını doğrulayın."
        : totalViews === 0
          ? "Uygun ürün gösterilememiş olabilir; katalog/eşleştirme kontrolü önerilir."
          : "Takip mesajı ile müşteriye geri dönülmesi önerilir.";

  return { summary: parts.join(" "), outcome, oems: input.oems, demand_hits: input.demandHits, recommendation };
}


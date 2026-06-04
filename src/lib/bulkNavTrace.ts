// Lightweight client-side trace for the "Toplu Parça Yükle" navigation flow.
// Records the click attempt and the arrival on /sell/bulk so we can verify
// in production (devtools + visible toast) that the button actually works.

const KEY = "bulk_nav_trace_v1";

type TraceEvent = {
  type: "click" | "arrival";
  at: number;
  href: string;
  ua: string;
  viewport: string;
  referrer?: string;
};

function read(): TraceEvent[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TraceEvent[]) : [];
  } catch {
    return [];
  }
}

function write(events: TraceEvent[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(events.slice(-20)));
  } catch {
    /* ignore quota */
  }
}

function snapshot(type: TraceEvent["type"]): TraceEvent {
  return {
    type,
    at: Date.now(),
    href: typeof window !== "undefined" ? window.location.href : "",
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    viewport:
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight}`
        : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
  };
}

export function recordBulkClick() {
  if (typeof window === "undefined") return;
  const evt = snapshot("click");
  const events = [...read(), evt];
  write(events);
  // eslint-disable-next-line no-console
  console.info("[bulk-nav] click", evt);
}

export function recordBulkArrival(): { ok: boolean; elapsedMs?: number } {
  if (typeof window === "undefined") return { ok: false };
  const evt = snapshot("arrival");
  const events = read();
  const lastClick = [...events].reverse().find((e) => e.type === "click");
  const elapsedMs = lastClick ? evt.at - lastClick.at : undefined;
  write([...events, evt]);
  // eslint-disable-next-line no-console
  console.info("[bulk-nav] arrival", { ...evt, elapsedMs });
  return { ok: !!lastClick && (elapsedMs ?? Infinity) < 60_000, elapsedMs };
}

export function getBulkTrace(): TraceEvent[] {
  return read();
}

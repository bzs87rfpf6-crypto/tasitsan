/**
 * Yeni deployment tespiti + güvenli cache-busting.
 *
 * Sorun: Google'dan gelen normal sekmede tarayıcı/ara katman eski HTML veya eski
 * service worker cache'ini kullanıp eski JS/CSS chunk'larını yüklüyordu; gizli
 * sekmede cache olmadığı için yeni sürüm görünüyordu.
 *
 * Çözüm: Sayfa tekrar görünür olduğunda (veya periyodik olarak) sunucudaki güncel
 * HTML `cache: "no-store"` ile çekilir. HTML'deki hash'li entry script'leri, o an
 * yüklü olan script'lerle karşılaştırılır. Hiçbiri eşleşmiyorsa yeni bir deployment
 * var demektir: eski Cache Storage kayıtları ve eski service worker temizlenir,
 * ardından sayfa TEK SEFER yenilenir (loop guard'lı).
 *
 * Kullanıcının tarayıcı geçmişi veya site verisi (localStorage/oturum) silinmez.
 */

const RELOAD_FLAG = "__ts_version_reload_at";
const RELOAD_COOLDOWN_MS = 60_000;
const MIN_CHECK_INTERVAL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 15 * 60_000;

function scriptKey(url: string) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function currentAssetKeys(): Set<string> {
  const keys = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((el) => {
    if (el.src) keys.add(scriptKey(el.src));
  });
  document.querySelectorAll<HTMLLinkElement>("link[rel='modulepreload'][href]").forEach((el) => {
    if (el.href) keys.add(scriptKey(el.href));
  });
  return keys;
}

function hashedScriptKeysFromHtml(html: string): string[] {
  const keys: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const src = match[1];
    if (!src) continue;
    if (!/^(https?:)?\/\//.test(src) && !src.startsWith("/")) continue;
    const key = scriptKey(src);
    // Sadece build çıktısı (hash'li) dosyaları dikkate al.
    if (/^\/(assets|_build)\//.test(key) || /-[a-zA-Z0-9_]{6,}\.(js|mjs)$/.test(key)) {
      keys.push(key);
    }
  }
  return keys;
}

async function clearStaleCaches() {
  const jobs: Array<Promise<unknown>> = [];
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      jobs.push(
        caches
          .keys()
          .then((names) => Promise.all(names.map((name) => caches.delete(name).catch(() => false))))
          .catch(() => undefined),
      );
    }
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.getRegistrations) {
      jobs.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) =>
            Promise.all(
              regs
                // Push bildirimleri için kullanılan /sw.js korunur; sadece eski
                // app-shell service worker'ları kaldırılır.
                .filter((reg) => {
                  const url = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
                  return !url.endsWith("/sw.js");
                })
                .map((reg) => reg.unregister().catch(() => false)),
            ),
          )
          .catch(() => undefined),
      );
    }
  } catch {
    /* yoksay */
  }
  await Promise.all(jobs).catch(() => undefined);
}

function canReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* sessionStorage kapalıysa yine de devam et */
  }
  return true;
}

async function checkForNewDeployment(): Promise<boolean> {
  const res = await fetch(window.location.pathname + (window.location.search || ""), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "x-tasitsan-version-check": "1" },
  });
  if (!res.ok) return false;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return false;
  const html = await res.text();
  const remoteKeys = hashedScriptKeysFromHtml(html);
  if (remoteKeys.length === 0) return false;
  const local = currentAssetKeys();
  if (local.size === 0) return false;
  // Uzak HTML'deki entry script'lerin hiçbiri yüklü değilse yeni build var.
  return remoteKeys.every((key) => !local.has(key));
}

export function startVersionWatcher(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let lastCheck = Date.now();
  let running = false;
  let disposed = false;

  const run = async (force = false) => {
    if (disposed || running) return;
    if (!force && Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) return;
    if (document.visibilityState !== "visible") return;
    running = true;
    lastCheck = Date.now();
    try {
      const stale = await checkForNewDeployment();
      if (stale && !disposed) {
        await clearStaleCaches();
        if (canReload()) window.location.reload();
      }
    } catch {
      /* ağ hatası: sessizce yoksay */
    } finally {
      running = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void run();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  const timer = window.setInterval(() => void run(true), POLL_INTERVAL_MS);

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.clearInterval(timer);
  };
}

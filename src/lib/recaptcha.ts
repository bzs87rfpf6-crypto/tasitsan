// reCAPTCHA v3 client helpers. Site key is public — safe to ship.
export const RECAPTCHA_SITE_KEY = "6LeRfBItAAAAADjcpQxrvaOEsuCIXPlYKYWNVwOj";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let loadingPromise: Promise<void> | null = null;

function shouldSkipRecaptcha(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith(".lovableproject.com") || host.startsWith("id-preview--");
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.grecaptcha) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha="v3"]');
    const onReady = () => {
      if (window.grecaptcha) window.grecaptcha.ready(() => resolve());
      else reject(new Error("recaptcha-not-loaded"));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("recaptcha-script-error")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.defer = true;
    s.dataset.recaptcha = "v3";
    s.addEventListener("load", onReady, { once: true });
    s.addEventListener("error", () => reject(new Error("recaptcha-script-error")), { once: true });
    document.head.appendChild(s);
  });
  return loadingPromise;
}

/** Returns a fresh reCAPTCHA v3 token for the given action. Throws on failure. */
export async function executeRecaptcha(action: string): Promise<string> {
  if (shouldSkipRecaptcha()) throw new Error("recaptcha-skipped-on-preview");
  await loadScript();
  if (!window.grecaptcha) throw new Error("recaptcha-unavailable");
  return window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
}

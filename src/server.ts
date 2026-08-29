import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { canonicalHostRedirect } from "./lib/canonical-host";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function applyCacheHeaders(request: Request, response: Response): Response {
  // Aynı response'u tekrar sarmalamak yerine header'ı yerinde değiştirmek
  // idempotent'tir; SSR/asset yanıtlarını tüketmez.
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const contentType = response.headers.get("content-type") ?? "";
    const isAsset = path.startsWith("/assets/") || path.startsWith("/_build/") || /\.[a-f0-9]{8,}\.(js|mjs|css|woff2?|ttf|png|jpe?g|webp|avif|svg)$/i.test(path);
    // Service worker ve manifest dosyaları asla cache'lenmemeli; aksi halde eski
    // bir SW/manifest yeni deployment sonrası aylarca yaşayabiliyor.
    const isNeverCache = /^\/(sw\.js|service-worker\.js|manifest\.json|site\.webmanifest)$/i.test(path);
    if (isNeverCache) {
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
    } else if (isAsset) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (contentType.includes("text/html")) {
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      response.headers.set("Vary", "Accept-Encoding");
    }
  } catch { /* ignore */ }
  return response;
}

// Eski bir deploy'un hashed chunk'ı silinmişse tarayıcı 404 alır ve
// "Failed to fetch dynamically imported module" fırlatır. Bunun yerine
// geçerli (200) bir kendini-onaran ES modülü döndürürüz: cache + service
// worker temizlenir ve sayfa tek sefer yenilenir (reload loop guard'lı).
const STALE_CHUNK_MODULE = `// stale build asset -> self-heal
(function () {
  try {
    var KEY = '__ts_chunk_reload_at';
    var last = Number(sessionStorage.getItem(KEY) || '0');
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch (e) {}
  var done = function () { try { location.reload(); } catch (e) {} };
  var jobs = [];
  try {
    if (self.caches && caches.keys) {
      jobs.push(caches.keys().then(function (n) { return Promise.all(n.map(function (k) { return caches.delete(k); })); }).catch(function () {}));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister().catch(function () {}); })); }).catch(function () {}));
    }
  } catch (e) {}
  Promise.all(jobs).then(done, done);
  setTimeout(done, 1500);
})();
export default null;
`;

function isHashedScriptPath(path: string) {
  if (!/\.(js|mjs)$/i.test(path)) return false;
  return path.startsWith("/assets/") || path.startsWith("/_build/") || /\.[a-f0-9]{8,}\.(js|mjs)$/i.test(path);
}

function healMissingChunk(request: Request, response: Response): Response {
  if (response.status !== 404) return response;
  try {
    const path = new URL(request.url).pathname;
    if (!isHashedScriptPath(path)) return response;
  } catch {
    return response;
  }
  return new Response(STALE_CHUNK_MODULE, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
    },
  });
}

// Gerçek 404 HTML çıktısında robots her zaman noindex olmalı; TanStack
// not-found dalında route head() çalışmadığı için burada garanti altına alınır.
async function enforceNoindexOn404(response: Response): Promise<Response> {
  if (response.status !== 404) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  let html: string;
  try {
    html = await response.clone().text();
  } catch {
    return response;
  }
  const noindex = `<meta name="robots" content="noindex,follow"/>`;
  const patched = /<meta[^>]+name="robots"[^>]*>/i.test(html)
    ? html.replace(/<meta[^>]+name="robots"[^>]*>/gi, noindex)
    : html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${noindex}`);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(patched, { status: 404, headers });
}


export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const hostRedirect = canonicalHostRedirect(request);
      if (hostRedirect) return hostRedirect;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const healed = healMissingChunk(request, applyCacheHeaders(request, normalized));
      return await enforceNoindexOn404(healed);
    } catch (error) {

      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache, no-store, must-revalidate",
        },
      });
    }
  },
};

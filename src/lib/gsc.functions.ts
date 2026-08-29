import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE_URL = "https://www.tasitsan.com.tr/";
const ORIGIN = "https://www.tasitsan.com.tr";
const SITEMAP_PATH = "/sitemap.xml";
const SITEMAP_URL = `${ORIGIN}${SITEMAP_PATH}`;
const ROBOTS_URL = `${ORIGIN}/robots.txt`;

function gscHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const gk = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lk || !gk) throw new Error("Google Search Console bağlantısı yapılandırılmamış (LOVABLE_API_KEY / GOOGLE_SEARCH_CONSOLE_API_KEY eksik).");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": gk,
  } as Record<string, string>;
}

type GscCall = {
  status: number;
  ok: boolean;
  body: string;
  json: any | null;
};

async function gscCall(path: string, init?: RequestInit): Promise<GscCall> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...gscHeaders(), ...(init?.headers || {}) },
  });
  const body = res.status === 204 ? "" : await res.text();
  let json: any = null;
  if (body) {
    try { json = JSON.parse(body); } catch { /* not json */ }
  }
  return { status: res.status, ok: res.ok, body, json };
}

export type SitemapStatus = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  warnings: number;
  errors: number;
  submitted: number;
  indexed: number;
};

function normalizeSitemap(raw: any): SitemapStatus {
  const c = (raw?.contents?.[0] ?? {}) as any;
  return {
    path: raw?.path ?? SITEMAP_URL,
    lastSubmitted: raw?.lastSubmitted ?? null,
    lastDownloaded: raw?.lastDownloaded ?? null,
    isPending: Boolean(raw?.isPending),
    warnings: Number(raw?.warnings ?? 0),
    errors: Number(raw?.errors ?? 0),
    submitted: Number(c?.submitted ?? 0),
    indexed: Number(c?.indexed ?? 0),
  };
}

// ---- Reachability probes -----------------------------------------------

type UrlProbe = {
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  bytes: number;
  error?: string;
};

async function probeUrl(url: string): Promise<UrlProbe> {
  try {
    const res = await fetch(url, { method: "GET", headers: { "User-Agent": "TasitsanSEOHealth/1.0" } });
    const buf = await res.arrayBuffer();
    return {
      url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
      bytes: buf.byteLength,
    };
  } catch (e: any) {
    return { url, status: 0, ok: false, contentType: null, bytes: 0, error: String(e?.message ?? e) };
  }
}

function extractChildSitemaps(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

// ---- Public server functions -------------------------------------------

export type SeoHealth = {
  site: {
    siteUrl: string;
    verified: boolean;
    permissionLevel: string | null;
    listStatus: number;
    listBody?: string;
  };
  sitemap: {
    index: UrlProbe;
    robots: UrlProbe;
    children: UrlProbe[];
    childCount: number;
    failedChildren: number;
  };
  submission: {
    attempted: boolean;
    kind: "submit" | "resubmit" | "skipped";
    submitStatus: number | null;
    submitBody: string | null;
    submitOk: boolean;
    status: SitemapStatus | null;
    statusHttp: number | null;
    statusBody: string | null;
    error: string | null;
  };
  generatedAt: string;
};

async function checkVerification() {
  const list = await gscCall(`/webmasters/v3/sites`);
  const entries: any[] = list.json?.siteEntry ?? [];
  const match = entries.find(
    (e) => e.siteUrl === SITE_URL || e.siteUrl === "https://tasitsan.com.tr/" || e.siteUrl === `sc-domain:tasitsan.com.tr`,
  );
  const perm = match?.permissionLevel ?? null;
  const verified = !!perm && perm !== "siteUnverifiedUser";
  return {
    siteUrl: SITE_URL,
    verified,
    permissionLevel: perm,
    listStatus: list.status,
    listBody: list.ok ? undefined : list.body.slice(0, 500),
  };
}

async function probeSitemapTree() {
  const index = await probeUrl(SITEMAP_URL);
  const robots = await probeUrl(ROBOTS_URL);
  let children: UrlProbe[] = [];
  if (index.ok) {
    const xml = await fetch(SITEMAP_URL).then((r) => r.text()).catch(() => "");
    const urls = extractChildSitemaps(xml);
    children = await Promise.all(urls.slice(0, 40).map(probeUrl));
  }
  return {
    index,
    robots,
    children,
    childCount: children.length,
    failedChildren: children.filter((c) => !c.ok).length,
  };
}

async function fetchOrSubmit(auto: boolean) {
  const site = encodeURIComponent(SITE_URL);
  const sm = encodeURIComponent(SITEMAP_URL);
  // First read current status
  const current = await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`);
  const alreadySubmitted = current.ok && !!current.json?.lastSubmitted;

  let submitCall: GscCall | null = null;
  let kind: "submit" | "resubmit" | "skipped" = "skipped";
  if (auto) {
    kind = alreadySubmitted ? "resubmit" : "submit";
    submitCall = await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`, { method: "PUT" });
  }

  // Re-read after submit
  const finalRead = auto && submitCall?.ok
    ? await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`)
    : current;

  return {
    attempted: auto,
    kind,
    submitStatus: submitCall?.status ?? null,
    submitBody: submitCall && !submitCall.ok ? submitCall.body.slice(0, 500) : null,
    submitOk: submitCall?.ok ?? false,
    status: finalRead.ok ? normalizeSitemap(finalRead.json) : null,
    statusHttp: finalRead.status,
    statusBody: finalRead.ok ? null : finalRead.body.slice(0, 500),
    error: null as string | null,
  };
}

export const getSeoHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ autoSubmit: z.boolean().default(true) }).parse(d ?? {}))
  .handler(async ({ context, data }): Promise<SeoHealth> => {
    await assertOwnerAdmin(context.supabase, context.userId);

    const [siteInfo, sitemapTree] = await Promise.all([
      checkVerification(),
      probeSitemapTree(),
    ]);

    let submission: SeoHealth["submission"] = {
      attempted: false,
      kind: "skipped",
      submitStatus: null,
      submitBody: null,
      submitOk: false,
      status: null,
      statusHttp: null,
      statusBody: null,
      error: null,
    };

    if (!siteInfo.verified) {
      submission.error = "Search Console mülkü doğrulanmamış (siteUnverifiedUser). Gönderim yapılamaz.";
    } else if (!sitemapTree.index.ok) {
      submission.error = `sitemap.xml erişilebilir değil (HTTP ${sitemapTree.index.status}).`;
    } else {
      try {
        submission = await fetchOrSubmit(data.autoSubmit);
      } catch (e: any) {
        submission.error = String(e?.message ?? e);
      }
    }

    return {
      site: siteInfo,
      sitemap: sitemapTree,
      submission,
      generatedAt: new Date().toISOString(),
    };
  });

// Kept for backwards compatibility with existing UI calls.
export const getSitemapStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const site = encodeURIComponent(SITE_URL);
    const sm = encodeURIComponent(SITEMAP_URL);
    const call = await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`);
    if (!call.ok) throw new Error(`GSC ${call.status}: ${call.body.slice(0, 300)}`);
    return normalizeSitemap(call.json);
  });

export const resubmitSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const site = encodeURIComponent(SITE_URL);
    const sm = encodeURIComponent(SITEMAP_URL);
    const put = await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`, { method: "PUT" });
    if (!put.ok) throw new Error(`GSC ${put.status}: ${put.body.slice(0, 300)}`);
    const call = await gscCall(`/webmasters/v3/sites/${site}/sitemaps/${sm}`);
    if (!call.ok) throw new Error(`GSC ${call.status}: ${call.body.slice(0, 300)}`);
    return normalizeSitemap(call.json);
  });

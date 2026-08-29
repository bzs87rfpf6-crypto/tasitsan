// SEO QA Suite — automated audit runner.
// Fetches robots.txt, sitemap.xml, home, and a sample of product pages, then
// runs regex checks + JSON-LD validation to produce a report with pass/warn/fail
// per check. Also computes a site-wide SEO score (0-100).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validateJsonLd } from "./jsonld-validator";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const BASE = "https://www.tasitsan.com.tr";

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
};

type FetchedPage = { url: string; status: number; html: string; ok: boolean };

async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "TasitsanSEOQA/1.0" },
    });
    clearTimeout(to);
    const html = res.status === 200 ? await res.text() : "";
    return { url, status: res.status, html, ok: res.ok };
  } catch {
    return { url, status: 0, html: "", ok: false };
  }
}

function pick(re: RegExp, html: string): string | null {
  const m = re.exec(html);
  return m ? (m[1] ?? "").trim() : null;
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      out.push({ __invalid: true });
    }
  }
  return out;
}

type PageAudit = {
  url: string;
  status: number;
  score: number;
  checks: CheckResult[];
};

function auditHtml(url: string, page: FetchedPage): PageAudit {
  const checks: CheckResult[] = [];
  const html = page.html;

  if (!page.ok) {
    checks.push({ id: "http", label: "HTTP", status: "fail", detail: `HTTP ${page.status}` });
    return { url, status: page.status, score: 0, checks };
  }
  checks.push({ id: "http", label: "HTTP 200", status: "pass" });

  const title = pick(/<title>([\s\S]*?)<\/title>/i, html);
  checks.push({
    id: "title",
    label: "Unique title",
    status: title && title.length >= 20 && title.length <= 75 ? "pass" : title ? "warn" : "fail",
    detail: title ? `${title.length} chars` : "missing",
  });

  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html);
  checks.push({
    id: "description",
    label: "Meta description",
    status: desc && desc.length >= 80 && desc.length <= 170 ? "pass" : desc ? "warn" : "fail",
    detail: desc ? `${desc.length} chars` : "missing",
  });

  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html);
  const canonicalOk = canonical && canonical.replace(/\/$/, "") === url.replace(/\/$/, "");
  checks.push({
    id: "canonical",
    label: "Canonical",
    status: canonicalOk ? "pass" : canonical ? "warn" : "fail",
    detail: canonical ?? "missing",
  });

  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, html);
  const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i, html);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, html);
  checks.push({
    id: "og",
    label: "Open Graph",
    status: ogTitle && ogDesc ? (ogImage ? "pass" : "warn") : "fail",
    detail: [ogTitle && "title", ogDesc && "desc", ogImage && "image"].filter(Boolean).join(", ") || "missing",
  });

  const twCard = pick(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i, html);
  checks.push({
    id: "twitter",
    label: "Twitter Card",
    status: twCard ? "pass" : "warn",
    detail: twCard ?? "missing",
  });

  // Robots
  const robots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i, html);
  const isNoindex = robots ? /noindex/i.test(robots) : false;
  checks.push({
    id: "indexability",
    label: "Indexability",
    status: isNoindex ? "warn" : "pass",
    detail: robots ?? "index,follow (default)",
  });

  // JSON-LD
  const blocks = extractJsonLdBlocks(html);
  const types = new Set<string>();
  let jsonldErrors = 0;
  for (const b of blocks) {
    if (b && typeof b === "object" && "__invalid" in (b as object)) {
      jsonldErrors += 1;
      continue;
    }
    const v = validateJsonLd(b);
    if (!v.valid) jsonldErrors += 1;
    const t = (b as Record<string, unknown>)?.["@type"];
    if (typeof t === "string") types.add(t);
  }
  const hasProduct = types.has("Product");
  const hasFaq = types.has("FAQPage");
  const hasBreadcrumb = types.has("BreadcrumbList");

  const isProductPage = /\/parts\//.test(url);
  checks.push({
    id: "jsonld-product",
    label: "Product JSON-LD",
    status: isProductPage ? (hasProduct && jsonldErrors === 0 ? "pass" : hasProduct ? "warn" : "fail") : "pass",
    detail: isProductPage ? (hasProduct ? "present" : "missing") : "n/a",
  });
  checks.push({
    id: "jsonld-faq",
    label: "FAQ JSON-LD",
    status: isProductPage ? (hasFaq ? "pass" : "warn") : "pass",
    detail: hasFaq ? "present" : "missing",
  });
  checks.push({
    id: "jsonld-breadcrumb",
    label: "Breadcrumb JSON-LD",
    status: hasBreadcrumb ? "pass" : "warn",
    detail: hasBreadcrumb ? "present" : "missing",
  });

  // Images / alt
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgTags.filter((t) => /\balt=["'][^"']+["']/i.test(t)).length;
  const altRatio = imgTags.length > 0 ? withAlt / imgTags.length : 1;
  checks.push({
    id: "alt",
    label: "Image ALT tags",
    status: imgTags.length === 0 ? "pass" : altRatio >= 0.9 ? "pass" : altRatio >= 0.6 ? "warn" : "fail",
    detail: `${withAlt}/${imgTags.length}`,
  });

  // Internal links
  const anchors = html.match(/<a\b[^>]+href=["']([^"']+)["'][^>]*>/gi) ?? [];
  let internal = 0;
  for (const a of anchors) {
    const href = /href=["']([^"']+)["']/i.exec(a)?.[1] ?? "";
    if (href.startsWith("/") || href.includes("tasitsan.com.tr")) internal += 1;
  }
  checks.push({
    id: "internal-links",
    label: "Internal links",
    status: internal >= 8 ? "pass" : internal >= 3 ? "warn" : "fail",
    detail: `${internal} on page`,
  });

  // Mobile friendliness = viewport meta
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.push({
    id: "mobile",
    label: "Mobile friendliness",
    status: viewport ? "pass" : "fail",
    detail: viewport ? "viewport set" : "no viewport meta",
  });

  // Page speed proxy — HTML size
  const kb = Math.round(html.length / 1024);
  checks.push({
    id: "speed",
    label: "Page weight",
    status: kb < 300 ? "pass" : kb < 700 ? "warn" : "fail",
    detail: `${kb} KB HTML`,
  });

  // Score = weighted pass/warn
  const weight: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round(
    (checks.reduce((s, c) => s + weight[c.status], 0) / checks.length) * 100,
  );

  return { url, status: page.status, score, checks };
}

export const runSeoQaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sample: z.number().int().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sample = data.sample ?? 15;

    // Site-wide artefacts
    const [robotsRes, sitemapRes] = await Promise.all([
      fetchPage(`${BASE}/robots.txt`, 5000),
      fetchPage(`${BASE}/sitemap.xml`, 8000),
    ]);
    const siteChecks: CheckResult[] = [];
    siteChecks.push({
      id: "robots",
      label: "robots.txt",
      status: robotsRes.ok ? (/User-agent:/i.test(robotsRes.html) ? "pass" : "warn") : "fail",
      detail: robotsRes.ok ? `${robotsRes.html.length} bytes` : `HTTP ${robotsRes.status}`,
    });
    const isSitemapIndex = /<sitemapindex/i.test(sitemapRes.html);
    const sitemapUrlCount = (sitemapRes.html.match(/<loc>/g) ?? []).length;
    siteChecks.push({
      id: "sitemap",
      label: "sitemap.xml",
      status: sitemapRes.ok && sitemapUrlCount > 0 ? "pass" : "fail",
      detail: sitemapRes.ok ? `${sitemapUrlCount} URLs${isSitemapIndex ? " (index)" : ""}` : `HTTP ${sitemapRes.status}`,
    });

    // Pull a random sample of approved parts
    const { data: parts } = await supabaseAdmin
      .from("parts")
      .select("id,seo_slug,title,oem_code,oem_codes")
      .eq("status", "approved")
      .limit(500);
    const arr = (parts ?? []) as Array<{ id: string; seo_slug: string | null; title: string; oem_code: string | null; oem_codes: string[] | null }>;
    // Shuffle + take sample
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const picks = arr.filter((p) => p.seo_slug && p.seo_slug.trim()).slice(0, sample);
    const partUrls = picks.map((p) => `${BASE}/parts/${p.seo_slug}`);
    const targetUrls = [`${BASE}/`, `${BASE}/parts`, ...partUrls];

    // Fetch in parallel (small pool)
    const fetched = await Promise.all(targetUrls.map((u) => fetchPage(u)));
    const audits = fetched.map((f) => auditHtml(f.url, f));

    // Duplicate content — compare titles + descriptions across sampled pages
    const titleCounts = new Map<string, number>();
    const descCounts = new Map<string, number>();
    for (const a of audits) {
      const t = a.checks.find((c) => c.id === "title")?.detail;
      const d = a.checks.find((c) => c.id === "description")?.detail;
      if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
      if (d) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
    }
    // Note: `detail` above stores length; instead re-run for actual text.
    const titlesText = fetched.map((f) => pick(/<title>([\s\S]*?)<\/title>/i, f.html) ?? "");
    const descsText = fetched.map((f) => pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, f.html) ?? "");
    const dupTitles = titlesText.filter((t, i) => t && titlesText.indexOf(t) !== i).length;
    const dupDescs = descsText.filter((t, i) => t && descsText.indexOf(t) !== i).length;
    siteChecks.push({
      id: "duplicate-content",
      label: "Duplicate content (sampled)",
      status: dupTitles === 0 && dupDescs === 0 ? "pass" : dupTitles + dupDescs <= 2 ? "warn" : "fail",
      detail: `titles: ${dupTitles} dup, descriptions: ${dupDescs} dup`,
    });

    // Broken links — HEAD-check first 15 links from home + parts index
    const homeAnchors = (fetched[0]?.html.match(/href=["']([^"']+)["']/g) ?? [])
      .map((s) => /href=["']([^"']+)["']/i.exec(s)?.[1] ?? "")
      .filter((h) => h.startsWith("/") && !h.startsWith("//"))
      .slice(0, 15)
      .map((h) => `${BASE}${h}`);
    const linkChecks = await Promise.all(
      homeAnchors.map(async (u) => {
        try {
          const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
          return { url: u, status: r.status, ok: r.ok };
        } catch {
          return { url: u, status: 0, ok: false };
        }
      }),
    );
    const broken = linkChecks.filter((r) => !r.ok);
    siteChecks.push({
      id: "broken-links",
      label: "Broken links (sampled)",
      status: broken.length === 0 ? "pass" : broken.length <= 2 ? "warn" : "fail",
      detail: `${broken.length}/${linkChecks.length} failing`,
    });

    // Overall site score
    const allChecks = [...siteChecks, ...audits.flatMap((a) => a.checks)];
    const weight: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };
    const siteScore = Math.round(
      (allChecks.reduce((s, c) => s + weight[c.status], 0) / allChecks.length) * 100,
    );

    // Per-product scores from stored SEO meta if present
    const partIds = picks.map((p) => p.id);
    const { data: metaRows } = partIds.length
      ? await supabaseAdmin.from("product_seo_meta").select("part_id,score").in("part_id", partIds)
      : { data: [] as Array<{ part_id: string; score: number }> };
    const metaMap = new Map<string, number>();
    for (const r of (metaRows ?? []) as Array<{ part_id: string; score: number }>) {
      metaMap.set(r.part_id, r.score);
    }
    const products = picks.map((p, i) => ({
      id: p.id,
      title: p.title,
      url: partUrls[i],
      liveScore: audits[i + 2]?.score ?? 0,
      storedScore: metaMap.get(p.id) ?? null,
    }));

    return {
      generatedAt: new Date().toISOString(),
      siteScore,
      siteChecks,
      pageAudits: audits,
      brokenLinks: broken,
      products,
      sampleSize: sample,
    };
  });

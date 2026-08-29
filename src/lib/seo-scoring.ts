// 0-100 SEO scoring engine. Each of 10 factors contributes up to 10 points.
// Returns score, per-factor breakdown, and a machine-readable issue list.

import type { NormalizedAttributes } from "./seo-attributes";

export interface ScoreInputs {
  title: string;
  description: string;
  content_hash: string;
  duplicate_hash_count: number; // how many rows share this hash (incl. self)
  faqs_count: number;
  internal_links_count: number;
  photos_count: number;
  alt_texts_count: number;
  indexable: boolean; // true unless flagged noindex
  canonical_ok: boolean; // canonical self-references the page
  attrs: NormalizedAttributes;
  own_description_length: number;
}

export interface ScoreBreakdown {
  title: number;
  description: number;
  uniqueness: number;
  faq: number;
  structured_data: number;
  internal_links: number;
  alt_text: number;
  indexability: number;
  canonical: number;
  duplicates: number;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  issues: string[];
}

export function computeSeoScore(i: ScoreInputs): ScoreResult {
  const issues: string[] = [];

  // 1. Title (0-10): length sweet spot 30-68
  let title = 0;
  const tl = i.title.length;
  if (tl >= 30 && tl <= 70) title = 10;
  else if (tl >= 20 && tl < 30) title = 6;
  else if (tl > 70 && tl <= 85) title = 6;
  else title = 3;
  if (tl < 20) issues.push("title_too_short");
  if (tl > 85) issues.push("title_too_long");

  // 2. Description (0-10): sweet 110-160
  let description = 0;
  const dl = i.description.length;
  if (dl >= 110 && dl <= 160) description = 10;
  else if (dl >= 80 && dl < 110) description = 6;
  else if (dl > 160 && dl <= 200) description = 6;
  else description = 2;
  if (dl < 80) issues.push("desc_too_short");
  if (dl > 200) issues.push("desc_too_long");

  // 3. Uniqueness / duplicate cluster (0-10)
  let uniqueness = 10;
  if (i.duplicate_hash_count > 1) {
    uniqueness = Math.max(0, 10 - (i.duplicate_hash_count - 1) * 3);
    issues.push("duplicate_content");
  }

  // 4. FAQ quality (0-10)
  const faq = i.faqs_count >= 6 ? 10 : i.faqs_count >= 4 ? 7 : i.faqs_count >= 1 ? 4 : 0;
  if (i.faqs_count === 0) issues.push("no_faqs");

  // 5. Structured data (Product JSON-LD requires brand+category+attrs)
  let structured = 4;
  if (i.attrs.brand) structured += 2;
  if (i.attrs.category) structured += 2;
  if (i.attrs.oem_primary) structured += 2;
  structured = Math.min(10, structured);
  if (!i.attrs.oem_primary) issues.push("missing_oem");
  if (!i.attrs.brand || !i.attrs.model) issues.push("missing_vehicle");

  // 6. Internal links (0-10): 6+ = perfect
  const links = i.internal_links_count >= 6 ? 10
    : i.internal_links_count >= 3 ? 7
    : i.internal_links_count >= 1 ? 4
    : 0;
  if (i.internal_links_count === 0) issues.push("no_internal_links");

  // 7. Alt text coverage (0-10)
  let alt = 0;
  if (i.photos_count === 0) {
    alt = 5; // no image = no alt needed but weaker page
    issues.push("no_photos");
  } else if (i.alt_texts_count >= i.photos_count) alt = 10;
  else alt = Math.max(2, Math.round((i.alt_texts_count / i.photos_count) * 10));
  if (i.photos_count > 0 && i.alt_texts_count < i.photos_count) issues.push("missing_alt_text");

  // 8. Indexability
  const indexability = i.indexable ? 10 : 0;
  if (!i.indexable) issues.push("noindex");

  // 9. Canonical correctness
  const canonical = i.canonical_ok ? 10 : 0;
  if (!i.canonical_ok) issues.push("canonical_mismatch");

  // 10. Duplicate cluster size penalty (separate from #3 — global)
  const duplicates = i.duplicate_hash_count > 1 ? Math.max(0, 10 - i.duplicate_hash_count) : 10;

  const breakdown: ScoreBreakdown = {
    title, description, uniqueness, faq, structured_data: structured,
    internal_links: links, alt_text: alt, indexability, canonical, duplicates,
  };
  const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return { score, breakdown, issues };
}

// JSON-LD validator + sanitizer.
// Strips undefined/null/empty branches, verifies required fields per @type,
// and returns { valid, errors, doc } so callers can decide whether to publish.
// Never mutates input; returns a cleaned deep copy.

export type JsonLdCheckResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  doc: Record<string, unknown> | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-clean: remove undefined, null, "", [], {} recursively. */
export function cleanJsonLd(input: unknown): unknown {
  if (Array.isArray(input)) {
    const arr = input.map(cleanJsonLd).filter((v) => v !== undefined && v !== null && v !== "");
    return arr.length ? arr : undefined;
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      const cleaned = cleanJsonLd(v);
      if (cleaned !== undefined && cleaned !== null && cleaned !== "") {
        if (isPlainObject(cleaned) && Object.keys(cleaned).length === 0) continue;
        if (Array.isArray(cleaned) && cleaned.length === 0) continue;
        out[k] = cleaned;
      }
    }
    return out;
  }
  return input;
}

function isHttpUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

/** Validate a JSON-LD doc against Google's Rich Results essentials. */
export function validateJsonLd(input: unknown): JsonLdCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cleaned = cleanJsonLd(input);
  if (!isPlainObject(cleaned)) {
    return { valid: false, errors: ["not-an-object"], warnings, doc: null };
  }
  const doc = cleaned as Record<string, unknown>;
  if (doc["@context"] !== "https://schema.org") errors.push("missing-@context");
  const type = doc["@type"];
  if (typeof type !== "string") {
    errors.push("missing-@type");
    return { valid: false, errors, warnings, doc };
  }

  switch (type) {
    case "Product": {
      if (!doc.name) errors.push("product.name-required");
      if (!doc.image) warnings.push("product.image-missing");
      // Guard against fake ratings: aggregateRating must have both fields.
      const ar = doc.aggregateRating;
      if (ar !== undefined) {
        if (!isPlainObject(ar) || ar.ratingValue == null || ar.reviewCount == null) {
          delete doc.aggregateRating;
          warnings.push("product.aggregateRating-stripped-incomplete");
        }
      }
      const offers = doc.offers;
      if (isPlainObject(offers)) {
        if (offers.price == null || Number(offers.price) <= 0) {
          delete doc.offers;
          warnings.push("product.offers-stripped-no-price");
        } else if (!offers.priceCurrency) {
          errors.push("product.offers.priceCurrency-required");
        }
      }
      break;
    }
    case "FAQPage": {
      const main = doc.mainEntity;
      if (!Array.isArray(main) || main.length === 0) errors.push("faq.mainEntity-empty");
      else {
        main.forEach((q, i) => {
          if (!isPlainObject(q)) errors.push(`faq.q[${i}]-invalid`);
          else if (!q.name || !isPlainObject(q.acceptedAnswer) || !q.acceptedAnswer.text) {
            errors.push(`faq.q[${i}]-missing-fields`);
          }
        });
      }
      break;
    }
    case "BreadcrumbList": {
      const items = doc.itemListElement;
      if (!Array.isArray(items) || items.length < 2) errors.push("breadcrumb.items-min-2");
      break;
    }
    case "Organization":
    case "WebSite": {
      if (!doc.name) errors.push(`${type}.name-required`);
      if (doc.url && !isHttpUrl(doc.url)) errors.push(`${type}.url-invalid`);
      break;
    }
    default:
      warnings.push(`unknown-type-${type}`);
  }

  return { valid: errors.length === 0, errors, warnings, doc };
}

/** Batch — validate multiple JSON-LDs. Returns cleaned docs that passed
 *  and the collected errors so callers can log them. */
export function validateAll(
  docs: unknown[],
): { published: Record<string, unknown>[]; rejected: Array<{ index: number; errors: string[] }>; totalWarnings: number } {
  const published: Record<string, unknown>[] = [];
  const rejected: Array<{ index: number; errors: string[] }> = [];
  let totalWarnings = 0;
  docs.forEach((raw, i) => {
    const r = validateJsonLd(raw);
    totalWarnings += r.warnings.length;
    if (r.valid && r.doc) published.push(r.doc);
    else rejected.push({ index: i, errors: r.errors });
  });
  return { published, rejected, totalWarnings };
}

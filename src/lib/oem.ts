// Helpers for parsing/displaying multiple OEM numbers.

export function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9\-./]/g, "").trim();
}

export function parseOemList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,;\n]+/)
        .map(normalizeOem)
        .filter((s) => s.length >= 3 && s.length <= 60),
    ),
  );
}

export function joinOemList(codes: string[] | null | undefined): string {
  return (codes ?? []).join(", ");
}

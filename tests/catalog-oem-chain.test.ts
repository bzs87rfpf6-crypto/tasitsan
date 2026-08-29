import { describe, expect, it } from "vitest";
import { CATALOG_PRIMARY_MIN, rerankCatalogMatches, type RerankInput } from "@/lib/catalog-rerank";

interface Row extends RerankInput {
  oem_no: string;
  alternative_oems?: string[];
}

/** catalog-search.server ile aynı OEM üretim kuralı (yüksek güvenli + ana OEM önce). */
function chainOems(query: string, rows: Row[]): string[] {
  const { primary } = rerankCatalogMatches(query, rows);
  const confident = primary.filter((p) => !p.promoted && p.finalScore >= CATALOG_PRIMARY_MIN);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (c?: string | null) => {
    if (!c) return;
    const n = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (n.length < 4 || seen.has(n)) return;
    seen.add(n);
    out.push(c);
  };
  for (const p of confident) push(p.row.oem_no);
  for (const p of confident) for (const a of (p.row.alternative_oems ?? []).slice(0, 3)) push(a);
  return out;
}

const MIXED: Row[] = [
  {
    part_name: "ÖN TAMPON",
    oem_no: "6400C543",
    alternative_oems: ["6400C543", "6400D123"],
    brand: "Mitsubishi",
    vehicle_model: "L200",
    vehicle_year: "2015-2019",
    score: 0.78,
  },
  {
    part_name: "ARKA TAMPON",
    oem_no: "6410A123",
    brand: "Mitsubishi",
    vehicle_model: "L200",
    score: 0.6,
  },
  {
    part_name: "ÖN TAMPON",
    oem_no: "620224EA0A",
    brand: "Nissan",
    vehicle_model: "Qashqai",
    score: 0.71,
  },
  {
    part_name: "ÖN FREN BALATASI",
    oem_no: "4605A557",
    brand: "Mitsubishi",
    vehicle_model: "L200",
    score: 0.66,
  },
];

describe("katalog → OEM zinciri", () => {
  it("Mitsubishi L200 ön tampon → sadece L200 ön tampon OEM'i, Nissan/arka/balata yok", () => {
    const oems = chainOems("Mitsubishi L200 ön tampon", MIXED);
    expect(oems[0]).toBe("6400C543");
    expect(oems).not.toContain("620224EA0A");
    expect(oems).not.toContain("6410A123");
    expect(oems).not.toContain("4605A557");
  });

  it("alternatif OEM'ler ana OEM'den sonra ve tekrarsız gelir", () => {
    const oems = chainOems("Mitsubishi L200 ön tampon", MIXED);
    expect(oems).toEqual(["6400C543", "6400D123"]);
  });

  it("Nissan Qashqai ön tampon → Mitsubishi OEM'leri zincire girmez", () => {
    const oems = chainOems("Nissan Qashqai ön tampon", MIXED);
    expect(oems).toContain("620224EA0A");
    expect(oems).not.toContain("6400C543");
  });

  it("alakasız araç sorgusunda (Skoda Octavia) düşük güvenli kayıt zincire girmez", () => {
    const oems = chainOems("Skoda Octavia ön tampon", MIXED);
    expect(oems).toHaveLength(0);
  });

  it("Renault Clio ön fren balatası → yalnız Renault kaydı", () => {
    const rows: Row[] = [
      {
        part_name: "ÖN FREN BALATASI",
        oem_no: "410603905R",
        brand: "Renault",
        vehicle_model: "Clio IV",
        score: 0.8,
      },
      {
        part_name: "ÖN FREN BALATASI",
        oem_no: "0446502220",
        brand: "Toyota",
        vehicle_model: "Corolla",
        score: 0.79,
      },
    ];
    expect(chainOems("Renault Clio ön fren balatası", rows)).toEqual(["410603905R"]);
  });
});

import { describe, expect, it } from "vitest";
import { rerankCatalogMatches, type RerankInput } from "@/lib/catalog-rerank";

interface Row extends RerankInput {
  oem_no: string;
}

const CATALOG: Row[] = [
  { part_name: "ÖN FREN DİSK BALATASI", oem_no: "04465-0K240", brand: "Toyota", vehicle_model: "Hilux", score: 0.82 },
  { part_name: "ARKA FREN BALATASI", oem_no: "04466-0K010", brand: "Toyota", vehicle_model: "Hilux", score: 0.64 },
  { part_name: "ÖN AMORTİSÖR", oem_no: "48510-0K530", brand: "Toyota", vehicle_model: "Hilux", score: 0.32 },
];

function run(query: string) {
  const { primary, secondary } = rerankCatalogMatches(query, CATALOG);
  return {
    primaryOems: primary.map((p) => p.row.oem_no),
    secondaryOems: secondary.map((p) => p.row.oem_no),
  };
}

describe("catalog rerank — anlamsal eşleştirme", () => {
  it("hilux ön fren balatası → 04465-0K240 ana sonuç, amortisör OEM çıkmaz", () => {
    const { primaryOems } = run("hilux ön fren balatası");
    expect(primaryOems[0]).toBe("04465-0K240");
    expect(primaryOems).not.toContain("48510-0K530");
  });

  it("hilux arka fren balatası → 04466-0K010 ana sonuç, ön amortisör çıkmaz", () => {
    const { primaryOems } = run("hilux arka fren balatası");
    expect(primaryOems[0]).toBe("04466-0K010");
    expect(primaryOems).not.toContain("48510-0K530");
  });

  it("hilux ön amortisör → 48510-0K530 ana sonuç, balata OEM'leri ana sonuç değil", () => {
    const { primaryOems } = run("hilux ön amortisör");
    expect(primaryOems[0]).toBe("48510-0K530");
    expect(primaryOems).not.toContain("04465-0K240");
    expect(primaryOems).not.toContain("04466-0K010");
  });

  it("balata → sadece fren balatası kayıtları, amortisör yok", () => {
    const { primaryOems, secondaryOems } = run("balata");
    expect(primaryOems.length).toBeGreaterThan(0);
    expect([...primaryOems, ...secondaryOems]).not.toContain("48510-0K530");
  });
});

const WESTINGHOUSE: Row[] = [
  {
    part_name: "FREN SERVOSU (WESTINGHOUSE) I30 DİZEL 12-18 / CEED DİZEL 12-18",
    oem_no: "59110-A6300",
    brand: "Hyundai",
    vehicle_model: "i30",
    vehicle_year: "2012-2018",
    score: 0.71,
  },
  {
    part_name: "FREN YARDIMCISI",
    oem_no: "58500-2H300",
    brand: "Hyundai",
    vehicle_model: "i30",
    vehicle_year: "2007-2012",
    score: 0.55,
  },
  {
    part_name: "SERVO FREN",
    oem_no: "44610-02460",
    brand: "Toyota",
    vehicle_model: "Corolla",
    vehicle_year: "2013-2018",
    score: 0.6,
  },
];

describe("catalog rerank — araç/model duyarlılığı", () => {
  it("i30 dizel westinghouse → Toyota sonucu ana sonuç olmaz", () => {
    const { primary, secondary } = rerankCatalogMatches("i30 dizel westinghouse", WESTINGHOUSE);
    const primaryOems = primary.map((p) => p.row.oem_no);
    expect(primaryOems).not.toContain("44610-02460");
    expect(secondary.map((s) => s.row.oem_no)).not.toContain("44610-02460");
    expect(primaryOems[0]).toBe("59110-A6300");
  });

  it("ceed dizel westinghouse → i30/Ceed kaydı ana sonuç", () => {
    const { primary } = rerankCatalogMatches("ceed dizel westinghouse", WESTINGHOUSE);
    expect(primary.map((p) => p.row.oem_no)[0]).toBe("59110-A6300");
    expect(primary.map((p) => p.row.oem_no)).not.toContain("44610-02460");
  });

  it("WESTINGHOUSE FREN I30 DİZEL 12-18/CEED DİZEL 12-18 → sadece Hyundai OEM'leri", () => {
    const { primary } = rerankCatalogMatches(
      "WESTINGHOUSE FREN I30 DİZEL 12-18/CEED DİZEL 12-18",
      WESTINGHOUSE,
    );
    expect(primary.map((p) => p.row.oem_no)).not.toContain("44610-02460");
    expect(primary[0]?.row.oem_no).toBe("59110-A6300");
  });
});

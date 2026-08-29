import { describe, expect, it } from "vitest";
import { analyzePartQuery } from "@/lib/part-query-analyzer";
import { verifyProductMatch } from "@/lib/smart-oem.server";

describe("analyzePartQuery", () => {
  it("fuzzy marka düzeltmesi yapar", () => {
    expect(analyzePartQuery("Chrey ön balata")).toEqual({
      originalQuery: "Chrey ön balata",
      normalizedQuery: "chery on fren balatasi",
      brand: "Chery",
      model: null,
      partCategory: "brake_pad",
      position: "front",
    });
  });

  it("doğru yazımda aynı sonucu verir", () => {
    const a = analyzePartQuery("Chery ön balata");
    expect(a.brand).toBe("Chery");
    expect(a.partCategory).toBe("brake_pad");
    expect(a.position).toBe("front");
    expect(a.model).toBeNull();
  });

  it("model varsa çıkarır, yoksa uydurmaz", () => {
    expect(analyzePartQuery("Chery Tiggo 7 ön balata").model).toBe("tiggo 7");
    expect(analyzePartQuery("Toyota Hilux ön balata").model).toBe("hilux");
    expect(analyzePartQuery("ön balata").brand).toBeNull();
  });

  it("slang terimleri eşler", () => {
    const a = analyzePartQuery("Toyota Hilux dodik");
    expect(a.brand).toBe("Toyota");
    expect(a.partCategory).toBe("ball_joint");
  });

  it("OEM benzeri sorguda kategori üretmez", () => {
    const a = analyzePartQuery("5193124050");
    expect(a.brand).toBeNull();
    expect(a.partCategory).toBeNull();
  });
});

describe("verifyProductMatch", () => {
  it("ön aranırken arka sonucu reddeder", () => {
    expect(verifyProductMatch("Arka Fren Balatası Takımı", "brake_pad", "front")).toBe(false);
  });
  it("uyumlu sonucu kabul eder", () => {
    expect(verifyProductMatch("Ön Fren Balatası Takımı", "brake_pad", "front")).toBe(true);
  });
  it("farklı kategoriyi reddeder", () => {
    expect(verifyProductMatch("Ön Fren Diski", "brake_pad", "front")).toBe(false);
  });
});

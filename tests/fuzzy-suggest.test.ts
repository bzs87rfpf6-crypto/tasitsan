import { describe, expect, it } from "vitest";
import { normalizeOemCode, normalizeText, rankSuggestions, similarity } from "@/lib/fuzzy-suggest";

describe("fuzzy-suggest", () => {
  it("Türkçe karakter ve noktalamayı normalize eder", () => {
    expect(normalizeText("Nıssan  Terrano-4x4!")).toBe("nissan terrano 4x4");
  });

  it("OEM format farklarını normalize eder", () => {
    expect(normalizeOemCode("52119-0K/982 ")).toBe("521190K982");
    expect(similarity("52119 0K982", "52119-0K982")).toBe(1);
  });

  it("yazım hatasını tolere eder", () => {
    expect(similarity("Nissan Terano", "Nissan Terrano")).toBeGreaterThan(0.8);
    expect(similarity("Nıssan Terrano", "Nissan Terrano")).toBe(1);
  });

  it("kelime sırası farkını tolere eder", () => {
    expect(similarity("Terrano Nissan", "Nissan Terrano")).toBe(1);
  });

  it("alakasız adayı elemek için eşik uygular", () => {
    const out = rankSuggestions("Nissan Terano", [
      { kind: "brand_model", label: "Nissan Terrano" },
      { kind: "part", label: "Mercedes Actros Fren Diski" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("Nissan Terrano");
  });

  it("sorgunun aynısını önermez ve en fazla limit kadar döner", () => {
    const out = rankSuggestions("Nissan Terrano", [
      { kind: "brand_model", label: "Nissan Terrano" },
      { kind: "brand_model", label: "Nissan Terrano II" },
    ], 5);
    expect(out.map((s) => s.label)).toEqual(["Nissan Terrano II"]);
  });
});

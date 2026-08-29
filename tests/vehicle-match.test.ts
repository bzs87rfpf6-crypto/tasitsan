import { describe, expect, it } from "vitest";
import {
  isOemLikeQuery,
  normalizeVehicleText,
  pickVehicleCorrection,
  shouldRewriteQuery,
} from "@/lib/vehicle-match";

const terrano = { brand: "Nissan", model: "Terrano", label: "Nissan Terrano", score: 0.95 };

describe("vehicle-match", () => {
  it("Türkçe karakter ve noktalamayı sadeleştirir", () => {
    expect(normalizeVehicleText("Nissan  TERRANO-II")).toBe("nissan terrano ii");
    expect(normalizeVehicleText("ŞAHİN")).toBe("sahin");
  });

  it("OEM sorgularını fuzzy katmanına sokmaz", () => {
    expect(isOemLikeQuery("52119-0K982")).toBe(true);
    expect(isOemLikeQuery("5193124050")).toBe(true);
    expect(isOemLikeQuery("NISSAN TERR")).toBe(false);
    expect(isOemLikeQuery("far")).toBe(false);
  });

  it("yarım yazımda öneriyi döndürür", () => {
    expect(pickVehicleCorrection("NISSAN TERR", [terrano])?.label).toBe("Nissan Terrano");
    expect(pickVehicleCorrection("nissan terran", [terrano])?.label).toBe("Nissan Terrano");
  });

  it("sorgu zaten doğruysa öneri göstermez", () => {
    expect(pickVehicleCorrection("Nissan Terrano", [terrano])).toBeNull();
  });

  it("OEM sorgusunda öneri üretmez", () => {
    expect(pickVehicleCorrection("52119-0K982", [terrano])).toBeNull();
  });

  it("düşük skorlu eşleşmeyi göstermez", () => {
    expect(pickVehicleCorrection("bmw", [{ ...terrano, score: 0.4 }])).toBeNull();
  });

  it("sadece yüksek güvenli eşleşmede sorguyu yeniden yazar", () => {
    expect(shouldRewriteQuery("NISSAN TERR", terrano)).toBe(true);
    expect(shouldRewriteQuery("NISSAN TERR", { ...terrano, score: 0.72 })).toBe(false);
    expect(shouldRewriteQuery("52119-0K982", terrano)).toBe(false);
  });
});

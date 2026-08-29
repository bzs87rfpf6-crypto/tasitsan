import { describe, expect, it } from "vitest";
import { buildSearchTokens } from "@/lib/search-tokens";

describe("buildSearchTokens", () => {
  it("Türkçe karakterleri sadeleştirir", () => {
    expect(buildSearchTokens("Chrey ön balata")).toEqual(["chrey", "on", "balata|balatasi"]);
  });

  it("anlamsız kelimeleri atar", () => {
    expect(buildSearchTokens("orjinal Toyota Hilux için far")).toEqual(["toyota", "hilux", "far|fari"]);
  });

  it("eş anlamlıları tek token içinde OR'lar", () => {
    expect(buildSearchTokens("kavrama")).toEqual(["kavrama|debriyaj"]);
  });

  it("OEM kodunu bozmaz", () => {
    expect(buildSearchTokens("T1E3501080")).toEqual(["t1e3501080"]);
  });
});

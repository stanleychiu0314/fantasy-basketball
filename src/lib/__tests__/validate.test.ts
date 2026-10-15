import { describe, expect, it } from "vitest";
import { cleanConfig } from "@/lib/validate";
import { defaultConfig } from "@/lib/season";

describe("punishment picks", () => {
  it("drops unknown ids and lets the earlier place keep a punishment picked twice", () => {
    const current = defaultConfig();
    const input = { ...current, punishmentPicks: { "4": "beer-mile", "5": "beer-mile", "6": "not-a-punishment" } };
    expect(cleanConfig(input, current).punishmentPicks).toEqual({ "4": "beer-mile", "5": null, "6": null });
  });
});

import { describe, expect, it } from "vitest";
import { computeCost, PRICING } from "./pricing";

describe("computeCost", () => {
  it("computes Gemini 2.5 Flash cost correctly", () => {
    const cost = computeCost({
      provider: "google",
      model: "gemini-2.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });
    // 1M * 0.30 + 100k * 2.50 / 1M = 0.30 + 0.25 = 0.55
    expect(cost).toBeCloseTo(0.55, 3);
  });

  it("applies cached-input discount when provided", () => {
    const cost = computeCost({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedTokens: 500_000,
    });
    // non-cached 500k @ $3/M + cached 500k @ $0.30/M = 1.5 + 0.15 = 1.65
    expect(cost).toBeCloseTo(1.65, 3);
  });

  it("returns 0 for unknown models", () => {
    expect(
      computeCost({ provider: "openai", model: "nonexistent", inputTokens: 1, outputTokens: 1 }),
    ).toBe(0);
  });

  it("has no duplicate keys in pricing table", () => {
    const keys = Object.keys(PRICING);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

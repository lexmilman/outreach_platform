import { describe, expect, it } from "vitest";
import { MessagesResultSchema, ScoringResultSchema } from "./schemas";

describe("ScoringResultSchema", () => {
  it("accepts a valid scoring response", () => {
    const r = ScoringResultSchema.safeParse({
      score: 78,
      tier: "high",
      reasons: ["Title matches ICP", "Recent funding round"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range score", () => {
    expect(
      ScoringResultSchema.safeParse({ score: 105, tier: "high", reasons: ["x"] }).success,
    ).toBe(false);
    expect(
      ScoringResultSchema.safeParse({ score: -1, tier: "low", reasons: ["x"] }).success,
    ).toBe(false);
  });

  it("requires at least one reason", () => {
    expect(
      ScoringResultSchema.safeParse({ score: 50, tier: "mid", reasons: [] }).success,
    ).toBe(false);
  });

  it("rejects unknown tier", () => {
    expect(
      ScoringResultSchema.safeParse({ score: 50, tier: "great", reasons: ["x"] }).success,
    ).toBe(false);
  });
});

describe("MessagesResultSchema", () => {
  const validBodies = [1, 2, 3, 4].map((step) => ({
    step,
    body: "x".repeat(60),
  }));

  it("accepts subject + 4 bodies + personalization", () => {
    const r = MessagesResultSchema.safeParse({
      subject: "Quick idea on X",
      bodies: validBodies,
      personalization: "Targeting VPs in fintech who recently posted about ML pipelines.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects fewer than 4 bodies", () => {
    expect(
      MessagesResultSchema.safeParse({
        subject: "subj",
        bodies: validBodies.slice(0, 3),
        personalization: "x".repeat(30),
      }).success,
    ).toBe(false);
  });

  it("rejects body shorter than 40 chars", () => {
    const tooShort = [...validBodies];
    tooShort[0] = { step: 1, body: "tiny" };
    expect(
      MessagesResultSchema.safeParse({
        subject: "subj",
        bodies: tooShort,
        personalization: "x".repeat(30),
      }).success,
    ).toBe(false);
  });
});

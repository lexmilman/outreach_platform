import { describe, expect, it } from "vitest";
import { JOB_TYPES, JobMessageSchema } from "./types";

const UUID = "00000000-0000-0000-0000-000000000001";

describe("JobMessageSchema", () => {
  it("enumerates all 13 job types", () => {
    expect(JOB_TYPES).toHaveLength(13);
    expect(new Set(JOB_TYPES).size).toBe(13);
  });

  it("accepts a valid enrich_person_apify message", () => {
    const res = JobMessageSchema.safeParse({
      type: "enrich_person_apify",
      payload: { personId: UUID },
    });
    expect(res.success).toBe(true);
  });

  it("rejects payload mismatched with the discriminated type", () => {
    const res = JobMessageSchema.safeParse({
      type: "enrich_person_apify",
      payload: { companyId: UUID }, // wrong key
    });
    expect(res.success).toBe(false);
  });

  it("rejects unknown job type", () => {
    const res = JobMessageSchema.safeParse({
      type: "definitely_not_a_job",
      payload: {},
    });
    expect(res.success).toBe(false);
  });

  it("clamps scrape_posts limit to [1,100]", () => {
    expect(
      JobMessageSchema.safeParse({
        type: "scrape_posts_apify",
        payload: { personId: UUID, limit: 500 },
      }).success,
    ).toBe(false);
    expect(
      JobMessageSchema.safeParse({
        type: "scrape_posts_apify",
        payload: { personId: UUID, limit: 50 },
      }).success,
    ).toBe(true);
  });

  it("requires at least one personInCampaignId for push_to_instantly", () => {
    expect(
      JobMessageSchema.safeParse({
        type: "push_to_instantly",
        payload: { campaignId: UUID, personInCampaignIds: [] },
      }).success,
    ).toBe(false);
  });

  it("rejects non-UUID identifiers", () => {
    expect(
      JobMessageSchema.safeParse({
        type: "enrich_person_apify",
        payload: { personId: "not-a-uuid" },
      }).success,
    ).toBe(false);
  });
});

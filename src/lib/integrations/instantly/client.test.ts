import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/../test/mocks/server";

const ORIG = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.MOCK_INSTANTLY = "0";
  process.env.INSTANTLY_API_KEY = "in_test_key";
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe("instantly client", () => {
  it("verifyEmail returns isValid=true for status 'valid'", async () => {
    const { verifyEmail } = await import("./client");
    const res = await verifyEmail("jane@acme.com");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("valid");
      expect(res.data.isValid).toBe(true);
      expect(res.costUsd).toBeCloseTo(0.0025);
    }
  });

  it("verifyEmail returns isValid=false for status 'invalid'", async () => {
    server.use(
      http.post("https://api.instantly.ai/api/v2/email-verification", () =>
        HttpResponse.json({ verification_status: "invalid" }),
      ),
    );
    const { verifyEmail } = await import("./client");
    const res = await verifyEmail("nobody@nowhere.zz");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("invalid");
      expect(res.data.isValid).toBe(false);
    }
  });

  it("MOCK_INSTANTLY=1 short-circuits to a valid stub", async () => {
    process.env.MOCK_INSTANTLY = "1";
    const { verifyEmail } = await import("./client");
    const res = await verifyEmail("anyone@anywhere.com");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isValid).toBe(true);
      expect(res.meta?.mock).toBe(true);
    }
  });

  it("bulkAddLeads forwards to /leads/add", async () => {
    const { bulkAddLeads } = await import("./client");
    const res = await bulkAddLeads({
      campaignId: "camp_1",
      leads: [{ email: "jane@acme.com", first_name: "Jane" }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.added).toBe(1);
  });

  it("bulkAddLeads MOCK returns provided lead count", async () => {
    process.env.MOCK_INSTANTLY = "1";
    const { bulkAddLeads } = await import("./client");
    const res = await bulkAddLeads({
      campaignId: "camp_1",
      leads: [
        { email: "a@x.com" },
        { email: "b@x.com" },
        { email: "c@x.com" },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.added).toBe(3);
  });

  it("createCampaign returns the id from the API", async () => {
    const { createCampaign } = await import("./client");
    const res = await createCampaign({
      name: "Sprint 4 smoke",
      sequences: [
        {
          steps: [
            { step: 1, delay_days: 0, subject: "{{subject}}", body: "{{email_copy_1}}" },
            { step: 2, delay_days: 3, subject: "re: {{subject}}", body: "{{email_copy_2}}" },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.campaignId).toBe("camp_created_test_1");
    }
  });

  it("createCampaign MOCK short-circuits to a generated id", async () => {
    process.env.MOCK_INSTANTLY = "1";
    const { createCampaign } = await import("./client");
    const res = await createCampaign({
      name: "mock",
      sequences: [{ steps: [{ step: 1, delay_days: 0, subject: "s", body: "b" }] }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.campaignId).toMatch(/^mock_camp_/);
      expect(res.meta?.mock).toBe(true);
    }
  });

  it("createCampaign rejects payloads that fail validation", async () => {
    const { createCampaign } = await import("./client");
    const res = await createCampaign({
      name: "",
      sequences: [],
    } as never);
    expect(res.ok).toBe(false);
  });

  it("renderSequenceStep substitutes {{tokens}}", async () => {
    const { renderSequenceStep } = await import("./client");
    const out = renderSequenceStep(
      { step: 1, delay_days: 0, subject: "Hey {{first_name}}", body: "{{email_copy_1}} ciao" },
      { first_name: "Jane", email_copy_1: "Body" },
    );
    expect(out.subject).toBe("Hey Jane");
    expect(out.body).toBe("Body ciao");
  });
});

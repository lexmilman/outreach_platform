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
});

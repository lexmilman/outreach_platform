import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/../test/mocks/server";

const ORIG = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.MOCK_FINDYMAIL = "0";
  process.env.FINDYMAIL_API_KEY = "fm_test_key";
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe("findymail client", () => {
  it("findEmailByLinkedin returns contact + cost on hit", async () => {
    const { findEmailByLinkedin } = await import("./client");
    const res = await findEmailByLinkedin("https://linkedin.com/in/jane");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.email).toBe("jane@acme.com");
      expect(res.costUsd).toBeCloseTo(0.015);
    }
  });

  it("findEmailByLinkedin returns null + zero cost on miss", async () => {
    server.use(
      http.post("https://app.findymail.com/api/search/linkedin", () =>
        HttpResponse.json({ contact: null }),
      ),
    );
    const { findEmailByLinkedin } = await import("./client");
    const res = await findEmailByLinkedin("https://linkedin.com/in/nobody");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toBeNull();
      expect(res.costUsd).toBe(0);
    }
  });

  it("MOCK_FINDYMAIL=1 short-circuits to fixture", async () => {
    process.env.MOCK_FINDYMAIL = "1";
    const { findEmailByLinkedin } = await import("./client");
    const res = await findEmailByLinkedin("https://linkedin.com/in/jane");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.email).toBe("jane.doe@acme.com");
      expect(res.meta?.mock).toBe(true);
    }
  });

  it("findEmailByName hits search/name endpoint", async () => {
    const { findEmailByName } = await import("./client");
    const res = await findEmailByName({ firstName: "Jane", lastName: "Doe", domain: "acme.com" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.email).toBe("j.doe@acme.com");
  });

  it("verifyEmail returns verified=true", async () => {
    const { verifyEmail } = await import("./client");
    const res = await verifyEmail("jane@acme.com");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.verified).toBe(true);
  });
});

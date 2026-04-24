/**
 * Integration scenario: email-finder waterfall on the Node side.
 *
 * Mirrors the Deno worker chain (handlers-email.ts) but exercised here with
 * the real fetchWithRetry + MSW so we catch contract breakage:
 *   1) FindyMail tier 1 (linkedin → email)
 *   2) on miss, SignalHire submits (returns request_id)
 *   3) Instantly verify on the discovered email
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/../test/mocks/server";

const ORIG = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.MOCK_FINDYMAIL = "0";
  process.env.MOCK_SIGNALHIRE = "0";
  process.env.MOCK_INSTANTLY = "0";
  process.env.FINDYMAIL_API_KEY = "fm_test";
  process.env.SIGNALHIRE_API_KEY = "sh_test";
  process.env.INSTANTLY_API_KEY = "in_test";
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe("email waterfall scenario", () => {
  it("happy path: findymail HIT → instantly verify VALID", async () => {
    const fmCalls: number[] = [];
    const ivCalls: number[] = [];
    server.use(
      http.post("https://app.findymail.com/api/search/linkedin", () => {
        fmCalls.push(Date.now());
        return HttpResponse.json({
          contact: { name: "Jane Doe", email: "jane@acme.com", domain: "acme.com" },
        });
      }),
      http.post("https://api.instantly.ai/api/v2/email-verification", () => {
        ivCalls.push(Date.now());
        return HttpResponse.json({ verification_status: "valid" });
      }),
    );

    const { findEmailByLinkedin } = await import("../findymail/client");
    const { verifyEmail } = await import("../instantly/client");

    const fm = await findEmailByLinkedin("https://linkedin.com/in/jane");
    expect(fm.ok).toBe(true);
    if (!fm.ok) throw new Error("unreachable");
    expect(fm.data?.email).toBe("jane@acme.com");
    expect(fmCalls).toHaveLength(1);

    const v = await verifyEmail(fm.data!.email);
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("unreachable");
    expect(v.data.isValid).toBe(true);
    expect(ivCalls).toHaveLength(1);
  });

  it("escalation path: findymail MISS → signalhire submit", async () => {
    const submitCalls: { items: string[]; callbackUrl: string }[] = [];
    server.use(
      http.post("https://app.findymail.com/api/search/linkedin", () =>
        HttpResponse.json({ contact: null }),
      ),
      http.post("https://www.signalhire.com/api/v1/candidate/search", async ({ request }) => {
        const body = (await request.json()) as { items: string[]; callbackUrl: string };
        submitCalls.push(body);
        return HttpResponse.json({ requestId: "req_async_xyz" }, { status: 201 });
      }),
    );

    const { findEmailByLinkedin } = await import("../findymail/client");
    const { submitCandidateSearch } = await import("../signalhire/client");

    const fm = await findEmailByLinkedin("https://linkedin.com/in/nobody");
    expect(fm.ok).toBe(true);
    if (!fm.ok) throw new Error("unreachable");
    expect(fm.data).toBeNull();
    expect(fm.costUsd).toBe(0);

    const sh = await submitCandidateSearch({
      items: ["https://linkedin.com/in/nobody"],
      callbackUrl: "https://app.example.com/cb?secret=xxx",
    });
    expect(sh.ok).toBe(true);
    if (!sh.ok) throw new Error("unreachable");
    expect(sh.data.requestId).toBe("req_async_xyz");
    expect(submitCalls[0]?.items).toEqual(["https://linkedin.com/in/nobody"]);
    expect(submitCalls[0]?.callbackUrl).toContain("secret=");
  });
});

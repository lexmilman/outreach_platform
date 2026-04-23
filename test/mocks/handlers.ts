import { http, HttpResponse } from "msw";

/**
 * Default MSW handlers.
 * Extend per-test with server.use(...) to simulate errors, rate limits, and odd shapes.
 * Never let a real network request escape: vitest setup uses `onUnhandledRequest: "error"`.
 */
export const handlers = [
  // Apify — start a run
  http.post("https://api.apify.com/v2/acts/*/runs", () =>
    HttpResponse.json({
      data: {
        id: "run_test_123",
        actId: "dev_fusion~linkedin-profile-scraper",
        status: "RUNNING",
        defaultDatasetId: "dataset_test_abc",
      },
    }),
  ),

  // FindyMail — linkedin search
  http.post("https://app.findymail.com/api/search/linkedin", () =>
    HttpResponse.json({
      contact: { name: "Jane Doe", email: "jane@acme.com", domain: "acme.com" },
    }),
  ),
  http.post("https://app.findymail.com/api/verify", () =>
    HttpResponse.json({ email: "jane@acme.com", verified: true, provider: "findymail" }),
  ),

  // SignalHire
  http.post("https://www.signalhire.com/api/v1/candidate/search", () =>
    HttpResponse.json({ requestId: "req_test_42" }, { status: 201 }),
  ),

  // Instantly
  http.post("https://api.instantly.ai/api/v2/leads/add", () =>
    HttpResponse.json({ added: 1 }),
  ),
  http.get("https://api.instantly.ai/api/v2/campaigns/analytics/overview", () =>
    HttpResponse.json({
      campaign_id: "camp_test_1",
      sent: 100,
      opened: 40,
      replied: 5,
      bounced: 2,
      unsubscribed: 0,
      clicked: 10,
      completed: 0,
      total_interested: 2,
      total_meeting_booked: 0,
      positive_replied: 2,
    }),
  ),

  // Perplexity
  http.post("https://api.perplexity.ai/chat/completions", () =>
    HttpResponse.json({
      id: "msg_test",
      model: "sonar-pro",
      choices: [
        { index: 0, message: { role: "assistant", content: "stub" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  ),
];

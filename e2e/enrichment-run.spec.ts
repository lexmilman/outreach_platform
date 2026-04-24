import { test, expect } from "@playwright/test";

/**
 * Sprint 3.6 — enrichment run e2e.
 *
 * Pre-reqs (set in environment when running this spec):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY
 *   MOCK_APIFY=1 MOCK_FINDYMAIL=1 MOCK_SIGNALHIRE=1 MOCK_INSTANTLY=1
 *
 * The Next dev server must start with the MOCK_* flags so the worker / webhook
 * paths short-circuit to fixtures instead of hitting real APIs.
 *
 * Scenario:
 *   1) Sign in via the test auth bypass.
 *   2) Seed: 1 client + 1 audience + 3 people with linkedin_url.
 *   3) From /people, select all 3, click "Run enrichment" → enqueues
 *      enrich_person_apify × 3.
 *   4) Wait for Realtime updates on /jobs showing 3 succeeded enrichments.
 *   5) Open a PersonDrawer, assert the enriched headline is present.
 *
 * Implementation behind .fixme() until TEST_SUPABASE_* secrets are provisioned.
 * Logical contract covered today by src/lib/integrations/_scenarios/
 * email-waterfall.test.ts plus the per-client MSW unit tests.
 */
test.describe("Enrichment run", () => {
  test.fixme(
    "kicks off enrichment on 3 leads, /jobs shows 3 succeeded, drawer reflects new fields",
    async ({ page }) => {
      await page.goto("/login");
      await page.goto("/people");
      // bulk select + click Run enrichment...
      await page.goto("/jobs");
      await expect(page.getByText("succeeded")).toHaveCount(3, { timeout: 30_000 });
    },
  );
});

/**
 * Pinned Apify actor catalog.
 *
 * `id` is the actor identifier in `username~actor` form.
 * `build` is the Apify build tag we want to run (passed as `?build=` to /runs).
 *   - Use a specific tag (e.g. "1.4.2") to lock against silent breaking changes.
 *   - Use "latest" only when you accept that actor authors may ship anything.
 *
 * To pin to a different build later: change the value here, run lint+tests,
 * commit. Actors update independently of our code, so a new build can break
 * dataset shape — the zod parser in apify/schemas.ts will catch it loudly.
 */
export const APIFY_ACTORS = {
  personProfile: {
    id: "dev_fusion~linkedin-profile-scraper",
    build: "latest",
    pricing: { usdPerThousand: 10 },
  },
  companyProfile: {
    id: "dev_fusion~linkedin-company-scraper",
    build: "latest",
    pricing: { usdPerThousand: 8 },
  },
  profilePosts: {
    id: "harvestapi~linkedin-profile-posts",
    build: "latest",
    pricing: { usdPerThousand: 1.5 },
  },
} as const satisfies Record<
  string,
  { id: string; build: string; pricing: { usdPerThousand: number } }
>;

export type ApifyActorKey = keyof typeof APIFY_ACTORS;

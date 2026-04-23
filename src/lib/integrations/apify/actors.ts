export const APIFY_ACTORS = {
  personProfile: "dev_fusion~linkedin-profile-scraper", // $10/1k, no cookies
  companyProfile: "dev_fusion~linkedin-company-scraper", // $8/1k
  profilePosts: "harvestapi~linkedin-profile-posts", // $1.50/1k, concurrency 6
} as const;

export type ApifyActorKey = keyof typeof APIFY_ACTORS;

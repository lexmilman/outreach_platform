/**
 * Alias corpus for LinkedHelper CSV exports.
 * Each canonical field lists known header variants (lowercased match).
 * Used by src/lib/csv/auto-map.ts to auto-wire columns via Fuse.js (threshold 0.35).
 *
 * Sprint 2: expand with the full ~91-column LinkedHelper export.
 */

export type CanonicalField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "linkedin_url"
  | "public_identifier"
  | "headline"
  | "about"
  | "current_title"
  | "current_company_name"
  | "current_company_linkedin_url"
  | "current_company_website"
  | "current_company_industry"
  | "location"
  | "country"
  | "photo_url"
  | "email"
  | "phone"
  | "connections_count"
  | "followers_count";

export const CANONICAL_ALIASES: Record<CanonicalField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  full_name: ["full name", "name", "display name"],
  linkedin_url: ["profile url", "linkedin", "linkedin url", "profile link", "sales navigator url"],
  public_identifier: ["public identifier", "public id", "vanity", "handle"],
  headline: ["headline", "bio", "tagline"],
  about: ["summary", "about", "about me", "description"],
  current_title: ["title", "position", "current position", "current title", "job title", "headline role"],
  current_company_name: [
    "company name",
    "current company",
    "current company name",
    "organization 1",
    "organization",
    "employer",
  ],
  current_company_linkedin_url: [
    "company url",
    "company linkedin",
    "company profile url",
    "organization 1 url",
  ],
  current_company_website: ["company website", "website", "organization website"],
  current_company_industry: ["industry", "company industry", "organization industry"],
  location: ["location", "city", "location name"],
  country: ["country", "country/region"],
  photo_url: ["photo", "image url", "avatar", "photo url"],
  email: ["email", "email 1", "primary email", "work email"],
  phone: ["phone", "phone 1", "mobile"],
  connections_count: ["connections", "connections count"],
  followers_count: ["followers", "followers count"],
};

export const ALL_CANONICAL_FIELDS = Object.keys(CANONICAL_ALIASES) as CanonicalField[];

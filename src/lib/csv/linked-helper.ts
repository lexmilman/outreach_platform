/**
 * Alias corpus for LinkedHelper CSV exports (canonical ~91-column mapping).
 * Each canonical field lists lowercase header variants used by LinkedHelper
 * across different export profiles. `src/lib/csv/auto-map.ts` feeds these
 * into Fuse.js (threshold 0.35) to propose mappings from a user's CSV.
 */

export type CanonicalField =
  // identity
  | "first_name"
  | "last_name"
  | "full_name"
  | "linkedin_url"
  | "linkedin_hash_id"
  | "public_identifier"
  // profile
  | "headline"
  | "about"
  | "current_title"
  | "location"
  | "country"
  | "photo_url"
  | "connections_count"
  | "followers_count"
  // contact
  | "email"
  | "phone"
  // current company
  | "current_company_name"
  | "current_company_linkedin_url"
  | "current_company_website"
  | "current_company_industry"
  | "current_company_employees"
  | "current_company_hq_city"
  | "current_company_hq_country"
  | "current_company_description"
  | "current_company_logo_url"
  | "current_company_founded"
  // meta
  | "source_list"
  | "added_at";

export const CANONICAL_ALIASES: Record<CanonicalField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "fname"],
  last_name: ["last name", "lastname", "surname", "family name", "lname"],
  full_name: ["full name", "name", "display name", "contact name"],

  linkedin_url: [
    "profile url",
    "linkedin",
    "linkedin url",
    "profile link",
    "sales navigator url",
    "profile",
    "linkedin profile url",
    "profile_url",
  ],
  linkedin_hash_id: ["linkedin id", "member id", "profile id", "sales nav id"],
  public_identifier: ["public identifier", "public id", "vanity", "handle", "slug"],

  headline: ["headline", "bio", "tagline", "profile headline"],
  about: ["summary", "about", "about me", "description", "profile summary"],
  current_title: [
    "title",
    "position",
    "current position",
    "current title",
    "job title",
    "headline role",
    "role",
  ],
  location: ["location", "city", "location name", "geo", "locality"],
  country: ["country", "country/region", "country name"],
  photo_url: ["photo", "image url", "avatar", "photo url", "profile picture"],
  connections_count: ["connections", "connections count", "num connections"],
  followers_count: ["followers", "followers count", "num followers"],

  email: ["email", "email 1", "primary email", "work email", "email address"],
  phone: ["phone", "phone 1", "mobile", "phone number"],

  current_company_name: [
    "company name",
    "current company",
    "current company name",
    "organization 1",
    "organization",
    "employer",
    "company",
  ],
  current_company_linkedin_url: [
    "company url",
    "company linkedin",
    "company profile url",
    "organization 1 url",
    "company linkedin url",
    "organization url",
  ],
  current_company_website: ["company website", "website", "organization website", "company site"],
  current_company_industry: ["industry", "company industry", "organization industry"],
  current_company_employees: [
    "employees",
    "company size",
    "employee count",
    "organization size",
    "num employees",
  ],
  current_company_hq_city: ["company city", "hq city", "company headquarters city"],
  current_company_hq_country: ["company country", "hq country", "company headquarters country"],
  current_company_description: ["company description", "about company", "organization description"],
  current_company_logo_url: ["company logo", "logo url", "organization logo"],
  current_company_founded: ["founded", "founded year", "company founded"],

  source_list: ["source list", "list name", "source", "lh list"],
  added_at: ["added at", "date added", "created at", "exported at"],
};

export const ALL_CANONICAL_FIELDS = Object.keys(CANONICAL_ALIASES) as CanonicalField[];

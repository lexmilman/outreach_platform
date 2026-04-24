import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { computeDedupKey } from "@/lib/dedup/dedup-key";
import { normalizeLinkedInUrl } from "@/lib/dedup/linkedin-url";
import type { Lead } from "./schemas";

export const MAX_ROWS_PER_IMPORT = 100_000;
export const CHUNK_SIZE = 500;

export type ImportReport = {
  totalRows: number;
  insertedPeople: number;
  matchedExistingPeople: number;
  insertedCompanies: number;
  matchedExistingCompanies: number;
  linkedCompanies: number;
  rejected: Array<{ index: number; reason: string }>;
};

function domainFromUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function buildPublicLinkedinUrl(publicId: string): string | null {
  const cleaned = publicId.trim().toLowerCase().replace(/\/+$/, "");
  if (!/^[a-z0-9][a-z0-9\-_.]*$/i.test(cleaned)) return null;
  return `https://www.linkedin.com/in/${cleaned}`;
}

type CompanyRow = {
  linkedin_url: string | null;
  domain: string | null;
  name: string | null;
  industry: string | null;
  employee_count: number | null;
  website: string | null;
  hq_city: string | null;
  hq_country: string | null;
  description: string | null;
  logo_url: string | null;
  data_json: Record<string, unknown>;
};

type PersonRow = {
  linkedin_url: string | null;
  linkedin_hash_id: string | null;
  public_identifier: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  country: string | null;
  photo_url: string | null;
  current_title: string | null;
  company_linkedin_url: string | null;
  company_domain: string | null;
  dedup_key: string | null;
  data_json: Record<string, unknown>;
};

export async function buildImportRows(
  leads: Lead[],
): Promise<{ people: PersonRow[]; companies: CompanyRow[] }> {
  const companiesByKey = new Map<string, CompanyRow>();
  const people: PersonRow[] = [];

  for (const lead of leads) {
    const personLinkedin = normalizeLinkedInUrl(lead.linkedin_url);
    const companyLinkedin = normalizeLinkedInUrl(lead.current_company_linkedin_url);
    const companyDomain = domainFromUrl(lead.current_company_website);

    const companyKey =
      companyLinkedin.publicUrl ?? (companyDomain ? `dom:${companyDomain}` : null);

    if (companyKey && !companiesByKey.has(companyKey)) {
      companiesByKey.set(companyKey, {
        linkedin_url: companyLinkedin.publicUrl,
        domain: companyDomain,
        name: lead.current_company_name ?? null,
        industry: lead.current_company_industry ?? null,
        employee_count: lead.current_company_employees ?? null,
        website: lead.current_company_website ?? null,
        hq_city: lead.current_company_hq_city ?? null,
        hq_country: lead.current_company_hq_country ?? null,
        description: lead.current_company_description ?? null,
        logo_url: lead.current_company_logo_url ?? null,
        data_json: lead.current_company_founded
          ? { founded_year: lead.current_company_founded }
          : {},
      });
    }

    const effectiveHashId = personLinkedin.hashId ?? lead.linkedin_hash_id ?? null;

    // If LinkedHelper gave us a public_id (vanity handle), prefer building a
    // public /in/ URL over leaving linkedin_url null. Sales Nav hash URLs
    // can't be reversed to public slugs from the CSV alone — that needs
    // SignalHire/Apify — but a non-empty public_id lets us skip the lookup.
    const publicUrlFromPublicId =
      !personLinkedin.publicUrl && lead.public_identifier
        ? buildPublicLinkedinUrl(lead.public_identifier)
        : null;
    const effectiveLinkedinUrl = personLinkedin.publicUrl ?? publicUrlFromPublicId;

    const dedupKey = await computeDedupKey({
      firstName: lead.first_name,
      lastName: lead.last_name,
      domain: companyDomain,
      hashId: effectiveHashId,
    });

    people.push({
      linkedin_url: effectiveLinkedinUrl,
      linkedin_hash_id: effectiveHashId,
      public_identifier: lead.public_identifier ?? null,
      first_name: lead.first_name ?? null,
      last_name: lead.last_name ?? null,
      full_name: lead.full_name ?? null,
      headline: lead.headline ?? null,
      about: lead.about ?? null,
      location: lead.location ?? null,
      country: lead.country ?? null,
      photo_url: lead.photo_url ?? null,
      current_title: lead.current_title ?? null,
      company_linkedin_url: companyLinkedin.publicUrl,
      company_domain: companyDomain,
      dedup_key: dedupKey,
      data_json: {
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.phone ? { phone: lead.phone } : {}),
        ...(lead.connections_count ? { connections_count: lead.connections_count } : {}),
        ...(lead.followers_count ? { followers_count: lead.followers_count } : {}),
        ...(lead.source_list ? { source_list: lead.source_list } : {}),
        ...(lead.current_company_name
          ? { company_name_raw: lead.current_company_name }
          : {}),
      },
    });
  }

  return { people, companies: Array.from(companiesByKey.values()) };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runImport(
  supabase: SupabaseClient<Database>,
  leads: Lead[],
): Promise<
  Omit<ImportReport, "totalRows" | "rejected"> & {
    linkedinUrls: string[];
    hashIds: string[];
    dedupKeys: string[];
  }
> {
  const { people, companies } = await buildImportRows(leads);

  let insertedCompanies = 0;
  let matchedExistingCompanies = 0;
  for (const batch of chunk(companies, CHUNK_SIZE)) {
    const { data, error } = await supabase.rpc("bulk_upsert_companies", {
      p_rows: batch as unknown as Json,
    });
    if (error) throw new Error(`bulk_upsert_companies failed: ${error.message}`);
    const row = data?.[0];
    if (row) {
      insertedCompanies += row.inserted ?? 0;
      matchedExistingCompanies += row.matched ?? 0;
    }
  }

  let insertedPeople = 0;
  let matchedExistingPeople = 0;
  let linkedCompanies = 0;
  for (const batch of chunk(people, CHUNK_SIZE)) {
    const { data, error } = await supabase.rpc("bulk_upsert_people", {
      p_rows: batch as unknown as Json,
    });
    if (error) throw new Error(`bulk_upsert_people failed: ${error.message}`);
    const row = data?.[0];
    if (row) {
      insertedPeople += row.inserted ?? 0;
      matchedExistingPeople += row.matched ?? 0;
      linkedCompanies += row.linked_companies ?? 0;
    }
  }

  const linkedinUrls = Array.from(
    new Set(people.map((p) => p.linkedin_url).filter((u): u is string => Boolean(u))),
  );
  const hashIds = Array.from(
    new Set(people.map((p) => p.linkedin_hash_id).filter((h): h is string => Boolean(h))),
  );
  const dedupKeys = Array.from(
    new Set(people.map((p) => p.dedup_key).filter((k): k is string => Boolean(k))),
  );

  return {
    insertedPeople,
    matchedExistingPeople,
    insertedCompanies,
    matchedExistingCompanies,
    linkedCompanies,
    linkedinUrls,
    hashIds,
    dedupKeys,
  };
}

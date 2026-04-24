import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildImportRows, runImport, CHUNK_SIZE } from "./import";
import type { Lead } from "./schemas";
import type { Database } from "@/types/database";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  // Use spread so explicit `undefined` in overrides wins over defaults.
  const defaults: Lead = {
    first_name: "Jane",
    last_name: "Doe",
    full_name: undefined,
    linkedin_url: `https://www.linkedin.com/in/janedoe${Math.random()}`,
    linkedin_hash_id: undefined,
    public_identifier: undefined,
    headline: undefined,
    about: undefined,
    current_title: "VP Eng",
    location: undefined,
    country: undefined,
    photo_url: undefined,
    connections_count: undefined,
    followers_count: undefined,
    email: undefined,
    phone: undefined,
    current_company_name: "Acme",
    current_company_linkedin_url: "https://www.linkedin.com/company/acme",
    current_company_website: "https://acme.com",
    current_company_industry: undefined,
    current_company_employees: undefined,
    current_company_hq_city: undefined,
    current_company_hq_country: undefined,
    current_company_description: undefined,
    current_company_logo_url: undefined,
    current_company_founded: undefined,
    source_list: undefined,
    added_at: undefined,
  } as Lead;
  return { ...defaults, ...overrides } as Lead;
}

type RpcCall = { name: string; args: { p_rows: unknown[] } };

function mockSupabase(responses: {
  companies?: { inserted: number; matched: number };
  people?: { inserted: number; matched: number; linked_companies: number };
}) {
  const calls: RpcCall[] = [];
  const rpc = vi.fn((name: string, args: { p_rows: unknown[] }) => {
    calls.push({ name, args });
    if (name === "bulk_upsert_companies") {
      return Promise.resolve({
        data: [responses.companies ?? { inserted: args.p_rows.length, matched: 0 }],
        error: null,
      });
    }
    if (name === "bulk_upsert_people") {
      return Promise.resolve({
        data: [
          responses.people ?? {
            inserted: args.p_rows.length,
            matched: 0,
            linked_companies: args.p_rows.length,
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: new Error(`unexpected rpc: ${name}`) });
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc, calls };
}

describe("runImport", () => {
  it("calls bulk_upsert_companies then bulk_upsert_people and aggregates counts", async () => {
    const { client, calls } = mockSupabase({
      companies: { inserted: 2, matched: 1 },
      people: { inserted: 3, matched: 0, linked_companies: 3 },
    });

    const leads = [
      makeLead({
        first_name: "Jane",
        linkedin_url: "https://www.linkedin.com/in/jane1",
        current_company_linkedin_url: "https://www.linkedin.com/company/acme",
      }),
      makeLead({
        first_name: "John",
        linkedin_url: "https://www.linkedin.com/in/john2",
        current_company_linkedin_url: "https://www.linkedin.com/company/globex",
      }),
      makeLead({
        first_name: "Alice",
        linkedin_url: "https://www.linkedin.com/in/alice3",
        current_company_linkedin_url: "https://www.linkedin.com/company/initech",
      }),
    ];

    const counts = await runImport(client, leads);
    expect(counts).toMatchObject({
      insertedCompanies: 2,
      matchedExistingCompanies: 1,
      insertedPeople: 3,
      matchedExistingPeople: 0,
      linkedCompanies: 3,
    });
    expect(counts.linkedinUrls).toHaveLength(3);
    expect(counts.hashIds).toHaveLength(0);

    // Companies call should come first.
    expect(calls[0]!.name).toBe("bulk_upsert_companies");
    expect(calls[1]!.name).toBe("bulk_upsert_people");
    // Three distinct companies sent.
    expect(calls[0]!.args.p_rows).toHaveLength(3);
  });

  it("chunks inputs larger than CHUNK_SIZE into multiple RPC calls", async () => {
    const { client, calls } = mockSupabase({});

    const leads = Array.from({ length: CHUNK_SIZE + 50 }, (_, i) =>
      makeLead({
        first_name: `User${i}`,
        linkedin_url: `https://www.linkedin.com/in/user${i}`,
        // share the same company so we only have 1 row in the companies RPC
        current_company_linkedin_url: "https://www.linkedin.com/company/acme",
      }),
    );

    await runImport(client, leads);

    const peopleCalls = calls.filter((c) => c.name === "bulk_upsert_people");
    expect(peopleCalls).toHaveLength(2);
    expect(peopleCalls[0]!.args.p_rows).toHaveLength(CHUNK_SIZE);
    expect(peopleCalls[1]!.args.p_rows).toHaveLength(50);
  });

  it("surfaces RPC errors as thrown exceptions", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } }));
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(runImport(client, [makeLead()])).rejects.toThrow(/bulk_upsert_companies failed/);
  });
});

describe("buildImportRows company dedup", () => {
  it("collapses repeated companies by linkedin_url", async () => {
    const leads = [
      makeLead({
        first_name: "Jane",
        linkedin_url: "https://www.linkedin.com/in/jane",
        current_company_linkedin_url: "https://www.linkedin.com/company/acme",
      }),
      makeLead({
        first_name: "John",
        linkedin_url: "https://www.linkedin.com/in/john",
        current_company_linkedin_url: "https://www.linkedin.com/company/acme",
      }),
    ];
    const { companies, people } = await buildImportRows(leads);
    expect(companies).toHaveLength(1);
    expect(people).toHaveLength(2);
    expect(people.every((p) => p.company_linkedin_url === "https://www.linkedin.com/company/acme")).toBe(true);
  });

  it("falls back to domain when no company linkedin url", async () => {
    const leads = [
      makeLead({
        first_name: "Jane",
        linkedin_url: "https://www.linkedin.com/in/janedoe",
        current_company_linkedin_url: undefined,
        current_company_website: "https://www.acme.com",
      }),
    ];
    const { companies, people } = await buildImportRows(leads);
    expect(companies).toHaveLength(1);
    expect(companies[0]!.linkedin_url).toBeNull();
    expect(companies[0]!.domain).toBe("acme.com");
    expect(people[0]!.company_domain).toBe("acme.com");
  });
});

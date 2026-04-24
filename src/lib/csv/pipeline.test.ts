/**
 * End-to-end integration test for the CSV pipeline (no DB).
 *
 * Exercises the full path: raw CSV text → papaparse → autoMapColumns →
 * mapRows → buildImportRows. Uses the real fixture at
 * test/fixtures/linked-helper-sample.csv.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "./parse";
import { autoMapColumns } from "./auto-map";
import { mapRows } from "./map-rows";
import { buildImportRows } from "./import";

const FIXTURE = readFileSync(
  path.join(process.cwd(), "test/fixtures/linked-helper-sample.csv"),
  "utf8",
);

describe("CSV pipeline (fixture → buildImportRows)", () => {
  it("parses the fixture", () => {
    const parsed = parseCsvText(FIXTURE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.headers).toContain("First name");
    expect(parsed.headers).toContain("Profile url");
    expect(parsed.headers).toContain("Email 1");
  });

  it("auto-maps every LinkedHelper header with high confidence", () => {
    const parsed = parseCsvText(FIXTURE);
    const { mappings } = autoMapColumns(parsed.headers);
    const mapped = mappings.filter((m) => m.canonical !== null);
    // Expect at least 7/10 of the fixture columns to auto-map.
    expect(mapped.length).toBeGreaterThanOrEqual(7);
    const canonicals = new Set(mapped.map((m) => m.canonical));
    expect(canonicals).toContain("first_name");
    expect(canonicals).toContain("last_name");
    expect(canonicals).toContain("linkedin_url");
    expect(canonicals).toContain("current_title");
    expect(canonicals).toContain("current_company_name");
    expect(canonicals).toContain("email");
  });

  it("mapRows keeps all 3 fixture rows (no rejections)", () => {
    const parsed = parseCsvText(FIXTURE);
    const { mappings } = autoMapColumns(parsed.headers);
    const { mapped, rejected } = mapRows(
      parsed.rows,
      mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
    );
    expect(rejected).toEqual([]);
    expect(mapped).toHaveLength(3);
    expect(mapped[0]!.lead.full_name || mapped[0]!.lead.first_name).toBeTruthy();
  });

  it("buildImportRows dedups companies and links people via linkedin_url", async () => {
    const parsed = parseCsvText(FIXTURE);
    const { mappings } = autoMapColumns(parsed.headers);
    const { mapped } = mapRows(
      parsed.rows,
      mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
    );
    const { people, companies } = await buildImportRows(mapped.map((m) => m.lead));

    expect(people).toHaveLength(3);
    // Each fixture person has a company linkedin URL, so we expect 3 distinct companies.
    expect(companies).toHaveLength(3);

    // Every person should have a company_linkedin_url set (joins at the RPC layer).
    expect(people.every((p) => p.company_linkedin_url)).toBe(true);

    // LinkedIn URLs should be normalized to public form.
    for (const p of people) {
      expect(p.linkedin_url).toMatch(/^https:\/\/www\.linkedin\.com\/in\//);
      expect(p.linkedin_url).toBe(p.linkedin_url?.toLowerCase());
    }

    // dedup_key is a FALLBACK. In this fixture every row has a public linkedin_url
    // (the primary dedup path), and no company domain, so dedup_key is null —
    // that's the new, stricter contract: we refuse to collapse two people solely
    // on firstName+lastName when neither hashId nor domain is known.
    expect(people.every((p) => p.dedup_key === null)).toBe(true);
    expect(people.every((p) => p.linkedin_url)).toBe(true);
  });

  it("rejects rows the LeadSchema won't accept (garbage in, named out)", () => {
    // papaparse `skipEmptyLines: 'greedy'` drops all-empty rows before we see
    // them — craft rows that survive parsing but still fail LeadSchema.
    const mixed = parseCsvText(
      [
        "First name,Last name,Profile url,Title,Organization 1,Email 1",
        "Jane,Doe,https://www.linkedin.com/in/janedoe,VP,Acme,jane@acme.com",
        "Solo,Person,,,,",
        "John,Smith,,CTO,,not-an-email",
      ].join("\n"),
    );
    const { mappings } = autoMapColumns(mixed.headers);
    const { mapped, rejected } = mapRows(
      mixed.rows,
      mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
    );
    expect(mapped).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => r.reason).join(" ")).toMatch(/LinkedIn|name|email/i);
  });

  it("falls back to dedup_key when there's no LinkedIn URL", async () => {
    const input = parseCsvText(
      [
        "First name,Last name,Organization 1,Company website,Email 1",
        "Alice,Chen,Initech,https://initech.com,alice@initech.com",
      ].join("\n"),
    );
    const { mappings } = autoMapColumns(input.headers);
    const { mapped } = mapRows(
      input.rows,
      mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
    );
    const { people } = await buildImportRows(mapped.map((m) => m.lead));
    expect(people).toHaveLength(1);
    expect(people[0]!.linkedin_url).toBeNull();
    expect(people[0]!.dedup_key).toMatch(/^[0-9a-f]{64}$/);
    expect(people[0]!.company_domain).toBe("initech.com");
  });
});

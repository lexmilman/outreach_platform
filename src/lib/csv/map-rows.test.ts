import { describe, expect, it } from "vitest";
import { mapRows } from "./map-rows";

const MAPPINGS = [
  { csvHeader: "First name", canonical: "first_name" as const },
  { csvHeader: "Last name", canonical: "last_name" as const },
  { csvHeader: "Profile url", canonical: "linkedin_url" as const },
  { csvHeader: "Title", canonical: "current_title" as const },
  { csvHeader: "Organization 1", canonical: "current_company_name" as const },
  { csvHeader: "Email 1", canonical: "email" as const },
  { csvHeader: "Junk", canonical: null },
];

describe("mapRows", () => {
  it("maps rows and keeps rejects with reasons", () => {
    const { mapped, rejected } = mapRows(
      [
        {
          "First name": "Jane",
          "Last name": "Doe",
          "Profile url": "https://linkedin.com/in/janedoe",
          Title: "VP Eng",
          "Organization 1": "Acme",
          "Email 1": "jane@acme.com",
          Junk: "xx",
        },
        {
          "First name": "",
          "Last name": "",
          "Profile url": "",
          Title: "",
          "Organization 1": "",
          "Email 1": "",
          Junk: "yy",
        },
      ],
      MAPPINGS,
    );

    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.lead.first_name).toBe("Jane");
    expect(mapped[0]!.lead.email).toBe("jane@acme.com");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatch(/LinkedIn URL|name/i);
  });

  it("accepts rows with just name + email (no LinkedIn)", () => {
    const { mapped } = mapRows(
      [
        {
          "First name": "John",
          "Last name": "Smith",
          "Profile url": "",
          Title: "CTO",
          "Organization 1": "",
          "Email 1": "john@globex.com",
          Junk: "",
        },
      ],
      MAPPINGS,
    );
    expect(mapped).toHaveLength(1);
  });

  it("rejects rows with bad email", () => {
    const { rejected } = mapRows(
      [
        {
          "First name": "John",
          "Last name": "Smith",
          "Profile url": "",
          Title: "",
          "Organization 1": "Globex",
          "Email 1": "not-an-email",
          Junk: "",
        },
      ],
      MAPPINGS,
    );
    expect(rejected).toHaveLength(1);
  });

  it("ignores unmapped columns entirely", () => {
    const { mapped } = mapRows(
      [
        {
          "First name": "Jane",
          "Last name": "Doe",
          "Profile url": "https://linkedin.com/in/janedoe",
          Title: "",
          "Organization 1": "",
          "Email 1": "",
          Junk: "anything",
        },
      ],
      MAPPINGS,
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.lead).not.toHaveProperty("Junk");
  });
});

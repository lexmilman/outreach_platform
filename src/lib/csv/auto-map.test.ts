import { describe, expect, it } from "vitest";
import { autoMapColumns } from "./auto-map";

describe("autoMapColumns", () => {
  it("maps common LinkedHelper headers", () => {
    const { mappings } = autoMapColumns([
      "First name",
      "Last name",
      "Profile url",
      "Title",
      "Organization 1",
      "Email 1",
      "Summary",
    ]);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader["First name"]).toBe("first_name");
    expect(byHeader["Last name"]).toBe("last_name");
    expect(byHeader["Profile url"]).toBe("linkedin_url");
    expect(byHeader["Title"]).toBe("current_title");
    expect(byHeader["Organization 1"]).toBe("current_company_name");
    expect(byHeader["Email 1"]).toBe("email");
    expect(byHeader["Summary"]).toBe("about");
  });

  it("leaves junk columns unmapped", () => {
    const { mappings } = autoMapColumns(["xxxzzz", "Random Column 42"]);
    expect(mappings.every((m) => m.canonical === null)).toBe(true);
  });

  it("does not map two columns to the same canonical", () => {
    const { mappings } = autoMapColumns(["First name", "firstname"]);
    const mapped = mappings.filter((m) => m.canonical === "first_name");
    expect(mapped.length).toBe(1);
  });

  it("handles LinkedHelper v2 snake_case headers", () => {
    const headers = [
      "first_name",
      "last_name",
      "full_name",
      "profile_url",
      "sn_hash_id",
      "public_id",
      "headline",
      "location_name",
      "avatar",
      "current_company",
      "current_company_position",
      "email",
    ];
    const { mappings } = autoMapColumns(headers);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader.first_name).toBe("first_name");
    expect(byHeader.last_name).toBe("last_name");
    expect(byHeader.full_name).toBe("full_name");
    expect(byHeader.profile_url).toBe("linkedin_url");
    expect(byHeader.sn_hash_id).toBe("linkedin_hash_id");
    expect(byHeader.public_id).toBe("public_identifier");
    expect(byHeader.headline).toBe("headline");
    expect(byHeader.location_name).toBe("location");
    expect(byHeader.avatar).toBe("photo_url");
    expect(byHeader.current_company).toBe("current_company_name");
    expect(byHeader.current_company_position).toBe("current_title");
    expect(byHeader.email).toBe("email");
  });
});

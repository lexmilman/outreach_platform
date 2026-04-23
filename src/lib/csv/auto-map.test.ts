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
});

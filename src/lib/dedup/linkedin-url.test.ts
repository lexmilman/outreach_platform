import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl } from "./linkedin-url";

describe("normalizeLinkedInUrl", () => {
  it("normalizes public /in/ URLs", () => {
    const r = normalizeLinkedInUrl("https://www.linkedin.com/in/JohnDoe/");
    expect(r.publicUrl).toBe("https://www.linkedin.com/in/johndoe");
    expect(r.hashId).toBeNull();
  });

  it("accepts without www.", () => {
    const r = normalizeLinkedInUrl("https://linkedin.com/in/jane-smith");
    expect(r.publicUrl).toBe("https://www.linkedin.com/in/jane-smith");
  });

  it("extracts sales nav hash from /sales/lead/", () => {
    const r = normalizeLinkedInUrl(
      "https://www.linkedin.com/sales/lead/ACwAAAB123XYZ,NAME_SEARCH,x9f2",
    );
    expect(r.publicUrl).toBeNull();
    expect(r.hashId).toBe("ACwAAAB123XYZ");
  });

  it("extracts sales nav hash from /sales/people/ (LinkedHelper v2 export)", () => {
    const r = normalizeLinkedInUrl(
      "https://www.linkedin.com/sales/people/ACwAAAA_QD0Bo5B1bXhaVTvlbI8SGWIHD-8oci8,x4Dm,NAME_SEARCH/",
    );
    expect(r.publicUrl).toBeNull();
    expect(r.hashId).toBe("ACwAAAA_QD0Bo5B1bXhaVTvlbI8SGWIHD-8oci8");
  });

  it("normalizes company URLs", () => {
    const r = normalizeLinkedInUrl("https://www.linkedin.com/company/Acme/");
    expect(r.publicUrl).toBe("https://www.linkedin.com/company/acme");
  });

  it("returns empty for junk", () => {
    const r = normalizeLinkedInUrl("not a url");
    expect(r.publicUrl).toBeNull();
    expect(r.hashId).toBeNull();
  });

  it("handles null/undefined", () => {
    expect(normalizeLinkedInUrl(null).publicUrl).toBeNull();
    expect(normalizeLinkedInUrl(undefined).publicUrl).toBeNull();
  });
});

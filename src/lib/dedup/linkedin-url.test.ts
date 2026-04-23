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

  it("extracts sales nav hash", () => {
    const r = normalizeLinkedInUrl(
      "https://www.linkedin.com/sales/lead/ACwAAAB123XYZ,NAME_SEARCH,x9f2",
    );
    expect(r.publicUrl).toBeNull();
    expect(r.hashId).toBe("ACwAAAB123XYZ");
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

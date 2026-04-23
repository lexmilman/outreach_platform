import { describe, expect, it } from "vitest";
import { computeDedupKey, dedupInput } from "./dedup-key";

describe("dedupInput", () => {
  it("lowercases + pipe-joins parts", () => {
    expect(dedupInput({ firstName: "Jane", lastName: "Doe", domain: "Acme.COM" })).toBe(
      "jane|doe|acme.com",
    );
  });

  it("trims whitespace", () => {
    expect(dedupInput({ firstName: "  Jane ", lastName: "Doe  ", domain: " acme.com" })).toBe(
      "jane|doe|acme.com",
    );
  });

  it("drops nullish parts", () => {
    expect(dedupInput({ firstName: "Jane", lastName: null, domain: "acme.com" })).toBe(
      "jane|acme.com",
    );
  });

  it("returns empty string when everything is missing", () => {
    expect(dedupInput({ firstName: null, lastName: null, domain: null })).toBe("");
  });
});

describe("computeDedupKey", () => {
  it("produces a stable sha256 hex", async () => {
    const a = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "acme.com" });
    const b = await computeDedupKey({ firstName: "jane", lastName: "DOE", domain: "Acme.com" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null when there's no name at all", async () => {
    expect(await computeDedupKey({ firstName: null, lastName: null, domain: "acme.com" })).toBeNull();
  });

  it("returns null when everything is empty", async () => {
    expect(await computeDedupKey({})).toBeNull();
  });

  it("differentiates by domain", async () => {
    const a = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "acme.com" });
    const b = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "globex.com" });
    expect(a).not.toBe(b);
  });
});

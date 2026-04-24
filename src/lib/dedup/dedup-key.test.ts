import { describe, expect, it } from "vitest";
import { computeDedupKey, dedupInput } from "./dedup-key";

describe("dedupInput", () => {
  it("prefers hashId over name+domain", () => {
    expect(
      dedupInput({
        firstName: "Jane",
        lastName: "Doe",
        domain: "acme.com",
        hashId: "ACwAAAB123",
      }),
    ).toBe("hash:ACwAAAB123");
  });

  it("falls back to name:first|last|domain when no hashId", () => {
    expect(dedupInput({ firstName: "Jane", lastName: "Doe", domain: "Acme.COM" })).toBe(
      "name:jane|doe|acme.com",
    );
  });

  it("trims whitespace on name parts", () => {
    expect(dedupInput({ firstName: "  Jane ", lastName: "Doe  ", domain: " acme.com" })).toBe(
      "name:jane|doe|acme.com",
    );
  });

  it("drops nullish parts when building the name key", () => {
    expect(dedupInput({ firstName: "Jane", lastName: null, domain: "acme.com" })).toBe(
      "name:jane|acme.com",
    );
  });

  it("returns empty string when everything is missing", () => {
    expect(dedupInput({})).toBe("");
  });
});

describe("computeDedupKey", () => {
  it("produces a stable sha256 hex from hashId", async () => {
    const a = await computeDedupKey({ hashId: "ACwAAAB123" });
    const b = await computeDedupKey({ hashId: "  ACwAAAB123  " });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashId path ignores name + domain — two Kens with same hash collapse", async () => {
    const a = await computeDedupKey({
      firstName: "Ken",
      lastName: "Milman",
      domain: null,
      hashId: "ACwAAAB111",
    });
    const b = await computeDedupKey({
      firstName: "Ken",
      lastName: "Milman",
      domain: "acme.com",
      hashId: "ACwAAAB111",
    });
    expect(a).toBe(b);
  });

  it("name path produces stable sha256 hex", async () => {
    const a = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "acme.com" });
    const b = await computeDedupKey({ firstName: "jane", lastName: "DOE", domain: "Acme.com" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to collapse two people on name alone (no hashId, no domain)", async () => {
    // Two different Ken Milmans at different companies must NOT share a dedup key.
    const a = await computeDedupKey({ firstName: "Ken", lastName: "Milman" });
    expect(a).toBeNull();
  });

  it("returns null when there's no name at all", async () => {
    expect(
      await computeDedupKey({ firstName: null, lastName: null, domain: "acme.com" }),
    ).toBeNull();
  });

  it("returns null when everything is empty", async () => {
    expect(await computeDedupKey({})).toBeNull();
  });

  it("differentiates by domain in name path", async () => {
    const a = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "acme.com" });
    const b = await computeDedupKey({ firstName: "Jane", lastName: "Doe", domain: "globex.com" });
    expect(a).not.toBe(b);
  });

  it("hashId and name paths produce different keys for same person", async () => {
    // Ensures old-name-based rows don't collide with new-hash-based rows.
    const viaHash = await computeDedupKey({ hashId: "ACwAAAB123" });
    const viaName = await computeDedupKey({
      firstName: "Jane",
      lastName: "Doe",
      domain: "acme.com",
    });
    expect(viaHash).not.toBe(viaName);
  });
});

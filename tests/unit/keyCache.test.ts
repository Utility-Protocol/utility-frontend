import { describe, it, expect } from "vitest";
import { sha256Hex, IntegrityError } from "@/services/keyCache";

describe("sha256Hex", () => {
  it("matches the known digest of an empty input", async () => {
    const hex = await sha256Hex(new ArrayBuffer(0));
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it('matches the known digest of "abc"', async () => {
    const bytes = new TextEncoder().encode("abc");
    const hex = await sha256Hex(bytes.buffer);
    expect(hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("returns lowercase hex of fixed 64-char length", async () => {
    const bytes = new TextEncoder().encode("meter-reading");
    const hex = await sha256Hex(bytes.buffer);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("IntegrityError", () => {
  it("captures the url, expected and actual digests", () => {
    const err = new IntegrityError("https://cdn/zkey", "aaaa", "bbbb");
    expect(err.name).toBe("IntegrityError");
    expect(err.url).toBe("https://cdn/zkey");
    expect(err.expected).toBe("aaaa");
    expect(err.actual).toBe("bbbb");
    expect(err.message).toContain("Integrity check failed");
  });
});

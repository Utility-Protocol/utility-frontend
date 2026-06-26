import { describe, it, expect } from "vitest";
import {
  prepareInputs,
  hexToFieldString,
  generateSalt,
  ProverInputError,
} from "@/services/zkProver";
import type { MeterReading } from "@/types/zk";
import type { ProofContext } from "@/services/zkProver";

const CONTEXT: ProofContext = {
  merkleRoot: "0x" + "ab".repeat(32),
  blockHash: "0x" + "cd".repeat(32),
  encryptedCiphertext: "0x" + "ef".repeat(64),
  salt: "0x" + "11".repeat(31),
};

describe("hexToFieldString", () => {
  it("converts 0x-prefixed hex to a decimal field string", () => {
    expect(hexToFieldString("0xff")).toBe("255");
    expect(hexToFieldString("ff")).toBe("255");
    expect(hexToFieldString("0x00")).toBe("0");
  });

  it("rejects malformed hex", () => {
    expect(() => hexToFieldString("0xzz")).toThrow(ProverInputError);
    expect(() => hexToFieldString("")).toThrow(ProverInputError);
  });
});

describe("generateSalt", () => {
  it("produces a 248-bit (62 hex char) 0x-prefixed value", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]{62}$/);
  });

  it("produces unique values across calls", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
  });
});

describe("prepareInputs", () => {
  const reading: MeterReading = {
    meterId: "0x" + "0a".repeat(31),
    consumption: 4200,
    timestamp: 1_700_000_000,
  };

  it("assembles a full witness with normalised field strings", () => {
    const inputs = prepareInputs(reading, CONTEXT);
    expect(inputs.consumption).toBe("4200");
    expect(inputs.timestamp).toBe(1_700_000_000);
    // Field elements are decimal strings, not hex.
    expect(inputs.meterId).toMatch(/^[0-9]+$/);
    expect(inputs.merkleRoot).toMatch(/^[0-9]+$/);
    expect(inputs.blockHash).toMatch(/^[0-9]+$/);
    // Ciphertext is carried through as-is (split into limbs by the circuit).
    expect(inputs.encryptedCiphertext).toBe(CONTEXT.encryptedCiphertext);
  });

  it("generates a salt when none is supplied", () => {
    const { salt, ...rest } = CONTEXT;
    void salt;
    const inputs = prepareInputs(reading, rest);
    expect(inputs.salt).toMatch(/^[0-9]+$/);
  });

  it("rejects consumption below the accepted range", () => {
    expect(() =>
      prepareInputs({ ...reading, consumption: -1 }, CONTEXT)
    ).toThrow(ProverInputError);
  });

  it("rejects consumption above the accepted range", () => {
    expect(() =>
      prepareInputs({ ...reading, consumption: 10_001 }, CONTEXT)
    ).toThrow(/outside the accepted range/);
  });

  it("rejects non-integer consumption", () => {
    expect(() =>
      prepareInputs({ ...reading, consumption: 12.5 }, CONTEXT)
    ).toThrow(ProverInputError);
  });

  it("rejects a missing meter id", () => {
    expect(() =>
      prepareInputs({ ...reading, meterId: "" }, CONTEXT)
    ).toThrow(/meterId is required/);
  });

  it("rejects a timestamp that does not fit in 32 bits", () => {
    expect(() =>
      prepareInputs({ ...reading, timestamp: 0x1_0000_0000 }, CONTEXT)
    ).toThrow(/32 bits/);
  });

  it("accepts the inclusive range boundaries", () => {
    expect(() =>
      prepareInputs({ ...reading, consumption: 0 }, CONTEXT)
    ).not.toThrow();
    expect(() =>
      prepareInputs({ ...reading, consumption: 10_000 }, CONTEXT)
    ).not.toThrow();
  });
});

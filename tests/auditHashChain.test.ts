import { describe, expect, it } from "vitest";
import {
  appendAuditRecord,
  AUDIT_GENESIS_HASH,
  calculateAuditHash,
  verifyAuditChain,
  type AuditRecord,
} from "@/services/audit/hashChain";

const baseInput = {
  actorId: "system:billing-api",
  service: "billing-api",
  occurredAt: "2026-07-18T00:00:00.000Z",
  payload: { invoiceId: "inv_123", amountCents: 4200, tags: ["utility", "settlement"] },
};

describe("audit hash chain", () => {
  it("appends records with deterministic hashes and verifies the chain", () => {
    const first = appendAuditRecord([], { ...baseInput, id: "evt_1", action: "invoice.created" });
    const second = appendAuditRecord([first], { ...baseInput, id: "evt_2", action: "invoice.approved" });

    expect(first.sequence).toBe(1);
    expect(first.previousHash).toBe(AUDIT_GENESIS_HASH);
    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);
    expect(verifyAuditChain([first, second])).toEqual({
      valid: true,
      headHash: second.hash,
      verifiedRecords: 2,
      issues: [],
    });
  });

  it("canonicalizes payload key order before hashing", () => {
    const a = appendAuditRecord([], {
      ...baseInput,
      id: "evt_1",
      action: "asset.updated",
      payload: { z: 1, a: { y: true, b: false } },
    });
    const b = appendAuditRecord([], {
      ...baseInput,
      id: "evt_1",
      action: "asset.updated",
      payload: { a: { b: false, y: true }, z: 1 },
    });

    expect(a.hash).toBe(b.hash);
  });

  it("reports tampering to payloads, previous hashes, and sequence gaps", () => {
    const first = appendAuditRecord([], { ...baseInput, id: "evt_1", action: "meter.read" });
    const second = appendAuditRecord([first], { ...baseInput, id: "evt_2", action: "meter.export" });
    const tampered: AuditRecord = {
      ...second,
      sequence: 4,
      previousHash: "f".repeat(64),
      payload: { ...second.payload, amountCents: 1 },
    };

    const result = verifyAuditChain([first, tampered]);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.reason)).toEqual([
      "sequence_gap",
      "previous_hash_mismatch",
      "hash_mismatch",
    ]);
    const { hash, ...tamperedWithoutHash } = tampered;
    void hash;
    expect(calculateAuditHash(tamperedWithoutHash)).not.toBe(second.hash);
  });
});

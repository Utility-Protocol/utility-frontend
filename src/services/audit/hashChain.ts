import { createHash } from "node:crypto";

export type AuditPayload = Record<string, unknown>;

export interface AuditRecordInput {
  id: string;
  action: string;
  actorId: string;
  service: string;
  occurredAt: string;
  payload: AuditPayload;
}

export interface AuditRecord extends AuditRecordInput {
  previousHash: string;
  hash: string;
  sequence: number;
}

export interface AuditVerificationIssue {
  sequence: number;
  id: string;
  reason: "sequence_gap" | "previous_hash_mismatch" | "hash_mismatch";
  expected: string | number;
  actual: string | number;
}

export interface AuditVerificationResult {
  valid: boolean;
  headHash: string;
  verifiedRecords: number;
  issues: AuditVerificationIssue[];
}

export const AUDIT_GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((canonical, key) => {
        canonical[key] = canonicalize((value as Record<string, unknown>)[key]);
        return canonical;
      }, {});
  }

  return value;
}

export function canonicalAuditJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function calculateAuditHash(record: Omit<AuditRecord, "hash">): string {
  return createHash("sha256")
    .update(canonicalAuditJson(record))
    .digest("hex");
}

export function appendAuditRecord(
  chain: readonly AuditRecord[],
  input: AuditRecordInput,
): AuditRecord {
  const previous = chain.at(-1);
  const recordWithoutHash: Omit<AuditRecord, "hash"> = {
    ...input,
    previousHash: previous?.hash ?? AUDIT_GENESIS_HASH,
    sequence: (previous?.sequence ?? 0) + 1,
  };

  return {
    ...recordWithoutHash,
    hash: calculateAuditHash(recordWithoutHash),
  };
}

export function verifyAuditChain(records: readonly AuditRecord[]): AuditVerificationResult {
  const issues: AuditVerificationIssue[] = [];
  let previousHash = AUDIT_GENESIS_HASH;
  let expectedSequence = 1;

  for (const record of records) {
    if (record.sequence !== expectedSequence) {
      issues.push({
        sequence: record.sequence,
        id: record.id,
        reason: "sequence_gap",
        expected: expectedSequence,
        actual: record.sequence,
      });
    }

    if (record.previousHash !== previousHash) {
      issues.push({
        sequence: record.sequence,
        id: record.id,
        reason: "previous_hash_mismatch",
        expected: previousHash,
        actual: record.previousHash,
      });
    }

    const { hash, ...recordWithoutHash } = record;
    void hash;
    const expectedHash = calculateAuditHash(recordWithoutHash);
    if (record.hash !== expectedHash) {
      issues.push({
        sequence: record.sequence,
        id: record.id,
        reason: "hash_mismatch",
        expected: expectedHash,
        actual: record.hash,
      });
    }

    previousHash = record.hash;
    expectedSequence = record.sequence + 1;
  }

  return {
    valid: issues.length === 0,
    headHash: records.at(-1)?.hash ?? AUDIT_GENESIS_HASH,
    verifiedRecords: records.length,
    issues,
  };
}

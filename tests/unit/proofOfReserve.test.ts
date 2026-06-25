import { describe, it, expect, vi } from "vitest";
import {
  aggregateAudit,
  checkSolvency,
  buildProofInputs,
  generateRandomness,
  attestationHashOf,
  runProofOfReserve,
  InsolvencyError,
  type ProofOfReserveDeps,
} from "@/services/proofOfReserve";
import type {
  AuditInventory,
  OnChainCommitment,
  RangeProof,
} from "@/types/reserve";

const audit = (totals: string[]): AuditInventory => ({
  entries: totals.map((total, i) => ({ resourceClass: `r${i}`, total })),
  serverTimestamp: 1_700_000_000,
  signature: "0xsig",
});

const commitment = (liability: string): OnChainCommitment => ({
  merkleRoot: "0x" + "ab".repeat(32),
  totalLiability: liability,
  lastAuditLedger: 42,
});

const fakeProof: RangeProof = {
  proof: "0x" + "11".repeat(32),
  commitment: "0x" + "22".repeat(32),
  challenge: "0x" + "33".repeat(32),
};

describe("aggregateAudit", () => {
  it("sums entry totals as bigints", () => {
    expect(aggregateAudit(audit(["100", "250", "650"]))).toBe(BigInt(1000));
  });

  it("handles values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(aggregateAudit(audit(["9007199254740993", "1"]))).toBe(
      BigInt("9007199254740994")
    );
  });
});

describe("checkSolvency", () => {
  it("returns null when reserves cover liability", () => {
    expect(checkSolvency(BigInt(1000), BigInt(1000))).toBeNull();
    expect(checkSolvency(BigInt(1000), BigInt(1500))).toBeNull();
  });

  it("reports a shortfall when reserves fall short", () => {
    const report = checkSolvency(BigInt(1000), BigInt(600));
    expect(report).toEqual({
      liability: "1000",
      auditTotal: "600",
      shortfall: "-400",
    });
  });
});

describe("buildProofInputs", () => {
  it("computes the surplus and carries the root", () => {
    const inputs = buildProofInputs(commitment("1000"), BigInt(1500));
    expect(inputs.surplus).toBe("500");
    expect(inputs.totalLiability).toBe("1000");
    expect(inputs.auditTotal).toBe("1500");
    expect(inputs.merkleRoot).toBe(commitment("1000").merkleRoot);
    expect(inputs.randomness).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("throws when the surplus exceeds the 64-bit range", () => {
    const huge = (BigInt(1) << BigInt(65)).toString();
    expect(() => buildProofInputs(commitment("0"), BigInt(huge))).toThrow(
      /64-bit range/
    );
  });
});

describe("generateRandomness / attestationHashOf", () => {
  it("produces a 32-byte hex blinding factor", () => {
    expect(generateRandomness()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("hashes the proof bytes to a 32-byte attestation hash", async () => {
    const hash = await attestationHashOf(fakeProof);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("runProofOfReserve", () => {
  const baseDeps = (over: Partial<ProofOfReserveDeps> = {}): ProofOfReserveDeps => ({
    fetchCommitment: vi.fn().mockResolvedValue(commitment("1000")),
    fetchAudit: vi.fn().mockResolvedValue(audit(["700", "500"])), // 1200 ≥ 1000
    prove: vi.fn().mockResolvedValue(fakeProof),
    ...over,
  });

  it("runs the full flow and reports progress in order", async () => {
    const progress: Array<[string, number]> = [];
    const submitAttestation = vi.fn().mockResolvedValue({ ledger: 99 });

    const outcome = await runProofOfReserve(
      { contractId: "C1", from: 0, to: 10 },
      baseDeps({ submitAttestation }),
      (phase, pct) => progress.push([phase, pct])
    );

    expect(outcome.auditTotal).toBe("1200");
    expect(outcome.result.ledger).toBe(99);
    expect(outcome.result.attestationHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(submitAttestation).toHaveBeenCalled();

    const phases = progress.map((p) => p[0]);
    expect(phases).toEqual([
      "fetching",
      "fetching",
      "proving",
      "submitting",
      "confirmed",
    ]);
    expect(progress[progress.length - 1][1]).toBe(100);
  });

  it("aborts with InsolvencyError when reserves fall short", async () => {
    await expect(
      runProofOfReserve(
        { contractId: "C1", from: 0, to: 10 },
        baseDeps({ fetchAudit: vi.fn().mockResolvedValue(audit(["100"])) })
      )
    ).rejects.toBeInstanceOf(InsolvencyError);
  });

  it("does not invoke the prover on insolvency", async () => {
    const prove = vi.fn().mockResolvedValue(fakeProof);
    await runProofOfReserve(
      { contractId: "C1", from: 0, to: 10 },
      baseDeps({ fetchAudit: vi.fn().mockResolvedValue(audit(["10"])), prove })
    ).catch(() => {});
    expect(prove).not.toHaveBeenCalled();
  });

  it("produces a proof with no submission when submitAttestation is absent", async () => {
    const outcome = await runProofOfReserve(
      { contractId: "C1", from: 0, to: 10 },
      baseDeps()
    );
    expect(outcome.result.ledger).toBeNull();
    expect(outcome.proof).toEqual(fakeProof);
  });
});

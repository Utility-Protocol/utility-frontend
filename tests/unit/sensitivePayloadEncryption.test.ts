import { describe, expect, it } from "vitest";
import {
  decryptEncryptedField,
  encryptSensitivePayload,
  importSensitivePayloadKey,
  isSensitiveFieldEncrypted,
  type EncryptedFieldEnvelope,
} from "@/services/sensitivePayloadEncryption";


const keyBytes = new Uint8Array(32).fill(7);

describe("sensitive payload encryption", () => {
  it("encrypts default and caller-provided sensitive fields recursively", async () => {
    const key = await importSensitivePayloadKey(keyBytes);
    const result = await encryptSensitivePayload(
      { id: "reading-1", token: "secret-token", nested: { meterSerial: "m-123", customId: "c-456" } },
      { key, keyId: "kid-1", sensitiveFieldNames: ["customId"] }
    );

    expect(result.encryptedFieldCount).toBe(3);
    expect(result.payload.id).toBe("reading-1");
    expect(isSensitiveFieldEncrypted(result.payload.token)).toBe(true);
    expect(isSensitiveFieldEncrypted(result.payload.nested.meterSerial)).toBe(true);
    expect(isSensitiveFieldEncrypted(result.payload.nested.customId)).toBe(true);
    expect(result.payload.token).not.toEqual("secret-token");

    await expect(decryptEncryptedField(result.payload.token as unknown as EncryptedFieldEnvelope, key)).resolves.toBe("secret-token");
    await expect(decryptEncryptedField(result.payload.nested.customId as unknown as EncryptedFieldEnvelope, key)).resolves.toBe("c-456");
  });

  it("does not double-encrypt existing envelopes", async () => {
    const key = await importSensitivePayloadKey(keyBytes);
    const first = await encryptSensitivePayload({ token: "secret-token" }, { key, keyId: "kid-1" });
    const second = await encryptSensitivePayload(first.payload, { key, keyId: "kid-1" });

    expect(second.encryptedFieldCount).toBe(0);
    expect(second.payload).toEqual(first.payload);
  });

  it("rejects invalid key lengths", async () => {
    await expect(importSensitivePayloadKey(new Uint8Array(8))).rejects.toThrow("128, 192, or 256 bits");
  });
});

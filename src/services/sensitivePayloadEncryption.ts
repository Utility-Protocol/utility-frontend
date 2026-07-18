const ENCRYPTION_VERSION = 1;
const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const DEFAULT_SENSITIVE_FIELD_NAMES = new Set([
  "accountNumber",
  "address",
  "apiKey",
  "authToken",
  "cardNumber",
  "email",
  "meterSerial",
  "phone",
  "privateKey",
  "secret",
  "sessionToken",
  "ssn",
  "token",
]);

export interface EncryptedFieldEnvelope {
  __type: "encrypted-field";
  version: typeof ENCRYPTION_VERSION;
  alg: typeof ALGORITHM;
  kid: string;
  iv: string;
  ciphertext: string;
}

export interface SensitivePayloadEncryptionOptions {
  keyId: string;
  key: CryptoKey;
  sensitiveFieldNames?: Iterable<string>;
}

export interface EncryptPayloadResult<T = unknown> {
  payload: T;
  encryptedFieldCount: number;
  durationMs: number;
}

type Path = Array<string | number>;
type SensitiveMatcher = (path: Path, value: unknown) => boolean;

function getCrypto(): Crypto {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error("WebCrypto SubtleCrypto is required for sensitive payload encryption");
  }
  return cryptoImpl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEncryptedEnvelope(value: unknown): value is EncryptedFieldEnvelope {
  return (
    isRecord(value) &&
    value.__type === "encrypted-field" &&
    value.version === ENCRYPTION_VERSION &&
    value.alg === ALGORITHM &&
    typeof value.kid === "string" &&
    typeof value.iv === "string" &&
    typeof value.ciphertext === "string"
  );
}

function toBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function buildMatcher(fieldNames?: Iterable<string>): SensitiveMatcher {
  const names = new Set(DEFAULT_SENSITIVE_FIELD_NAMES);
  for (const name of fieldNames ?? []) names.add(name);
  return (path) => {
    const field = path[path.length - 1];
    return typeof field === "string" && names.has(field);
  };
}

async function encryptValue(value: unknown, options: SensitivePayloadEncryptionOptions) {
  const cryptoImpl = getCrypto();
  const iv = cryptoImpl.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await cryptoImpl.subtle.encrypt({ name: ALGORITHM, iv: iv as BufferSource }, options.key, plaintext)
  );

  return {
    __type: "encrypted-field",
    version: ENCRYPTION_VERSION,
    alg: ALGORITHM,
    kid: options.keyId,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  } satisfies EncryptedFieldEnvelope;
}

export async function importSensitivePayloadKey(rawKey: Uint8Array | ArrayBuffer): Promise<CryptoKey> {
  const keyBytes = rawKey instanceof Uint8Array ? rawKey : new Uint8Array(rawKey);
  if (![16, 24, 32].includes(keyBytes.byteLength)) {
    throw new Error("Sensitive payload key must be 128, 192, or 256 bits");
  }
  return getCrypto().subtle.importKey("raw", keyBytes as BufferSource, ALGORITHM, false, ["encrypt", "decrypt"]);
}

export async function encryptSensitivePayload<T>(
  payload: T,
  options: SensitivePayloadEncryptionOptions
): Promise<EncryptPayloadResult<T>> {
  const started = performance.now();
  const matcher = buildMatcher(options.sensitiveFieldNames);
  let encryptedFieldCount = 0;

  async function visit(value: unknown, path: Path): Promise<unknown> {
    if (isEncryptedEnvelope(value)) return value;
    if (matcher(path, value) && value !== null && value !== undefined) {
      encryptedFieldCount += 1;
      return encryptValue(value, options);
    }
    if (Array.isArray(value)) return Promise.all(value.map((item, index) => visit(item, [...path, index])));
    if (isRecord(value)) {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, child]) => [key, await visit(child, [...path, key])] as const)
      );
      return Object.fromEntries(entries);
    }
    return value;
  }

  return {
    payload: (await visit(payload, [])) as T,
    encryptedFieldCount,
    durationMs: performance.now() - started,
  };
}

export async function decryptEncryptedField<T = unknown>(
  envelope: EncryptedFieldEnvelope,
  key: CryptoKey
): Promise<T> {
  const plaintext = await getCrypto().subtle.decrypt(
    { name: ALGORITHM, iv: fromBase64(envelope.iv) as BufferSource },
    key,
    fromBase64(envelope.ciphertext) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function isSensitiveFieldEncrypted(value: unknown): value is EncryptedFieldEnvelope {
  return isEncryptedEnvelope(value);
}

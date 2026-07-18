# Sensitive Payload Field Encryption

## Architecture

Sensitive payload field encryption runs in the API client before JSON request bodies leave the browser. Callers provide a non-extractable WebCrypto `CryptoKey` and key id (`kid`) through the API request config. The client recursively walks request bodies and replaces configured sensitive fields with an AES-GCM envelope.

```json
{
  "__type": "encrypted-field",
  "version": 1,
  "alg": "AES-GCM",
  "kid": "tenant-key-2026-07",
  "iv": "base64 nonce",
  "ciphertext": "base64 ciphertext plus auth tag"
}
```

Default sensitive fields include tokens, account numbers, contact fields, secrets, and private keys. Services can extend that list per request with `sensitiveFieldNames` so domain payloads can add regulated identifiers without changing shared code.

## Security controls

- AES-GCM uses a fresh 96-bit IV for every encrypted field.
- Raw key material is imported as a non-extractable WebCrypto key.
- Already encrypted envelopes are left untouched to prevent double encryption.
- Encryption is explicit and fail-closed: if WebCrypto is unavailable or key material is invalid, the request fails before transmission.

## Performance target

The frontend measures encryption duration for each request body and logs a warning when encrypted payload preparation exceeds the 100 ms critical-path target. Production telemetry should capture this warning as `sensitive_payload_encryption.duration_ms` with tags for route, key id, and encrypted field count.

## Monitoring and alerting

Recommended service-level indicators:

- P99 encryption duration < 100 ms over 5 minutes.
- Encryption failure rate < 0.01% over 5 minutes.
- Payloads containing configured sensitive field names without encrypted envelopes: zero tolerated.

Alert when P99 duration exceeds 100 ms for two consecutive windows or when any plaintext sensitive-field detector fires in edge/service logs.

## Deployment runbook

1. Deploy backend envelope parsing and key-resolution support behind a disabled feature flag.
2. Deploy this frontend encryption path disabled by default.
3. Enable canary traffic for one tenant or environment and verify decrypt success, latency, and plaintext-detector dashboards.
4. Expand using blue-green deployment. Keep the previous green stack available until decrypt errors remain below threshold for one full rotation window.
5. Rotate keys by publishing a new `kid`, accepting old and new key ids during the overlap, then retiring the old key after queued/offline requests drain.

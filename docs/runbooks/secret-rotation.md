# Secret Rotation Service Runbook

## Architecture

The frontend models secret rotation as metadata only: secret identifiers, versions,
ownership, service-level telemetry, and promotion decisions. Secret values remain in
server-side secret managers and must never be exposed through `NEXT_PUBLIC_` values or
client components. This follows the Next.js data-security guidance that secrets belong
in environment variables and server-side data access layers.

## Rotation flow

1. Detect due database credentials and API keys from their configured rotation interval.
2. Create the next credential version while keeping the active version enabled.
3. Enter dual-read/dual-write mode so clients can authenticate with both versions.
4. Deploy green clients with blue-green routing and begin a 5% canary.
5. Promote only when critical-path P99 latency is below 100 ms, availability is at least
   99.99%, error rate is within budget, and canary success is at least 99.9%.
6. Revoke the previous credential only after connection pools drain and audit evidence
   has been attached to the security review.

## Monitoring and alerts

Dashboards should chart per-secret owner, active and next versions, milliseconds until
rotation is due, P99 latency, availability percentage, error rate, and canary success
rate. Alert when any promotion guardrail fails; failed canaries must freeze expansion,
route traffic back to blue, and page the owning service plus security reviewers.

## Deployment checklist

- Security review approved for the credential scope and revocation plan.
- Blue credential version remains available throughout the canary.
- Green deployment starts at 5% traffic and expands only after automated guardrails pass.
- Rollback keeps the previous credential enabled until all clients report recovery.
- Post-rotation evidence records the promoted version, revoked version, timestamps, and
  dashboard links.

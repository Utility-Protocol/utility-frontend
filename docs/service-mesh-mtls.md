# Service Mesh Integration with Mutual TLS

## Architecture

The frontend runs in the `utility-frontend` namespace with automatic sidecar injection. Istio enforces namespace-wide `STRICT` mutual TLS through `PeerAuthentication`; clients must use mesh-issued workload identities and `ISTIO_MUTUAL` transport defined by the destination rule.

Traffic enters through the public Istio gateway, then routes to blue and green subsets for canary analysis. Authorization is default-deny except for the ingress gateway service account, which may call the frontend on port `3000` with `GET`, `POST`, and `HEAD`.

## SLOs and rollout gates

- Critical path latency: P99 must remain below `100ms`; telemetry ingest is budgeted at `75ms`.
- Availability: `99.99%` monthly uptime target.
- Canary stages: 5% for 15 minutes, 25% for 30 minutes, 50% for 30 minutes, then 100% for 30 minutes.
- Roll back immediately if P99 exceeds budget for two consecutive five-minute windows, 5xx rate exceeds 1%, or mTLS authorization failures increase above baseline.

## Monitoring and alerting

Use Prometheus metrics emitted by Istio telemetry:

- `istio_request_duration_milliseconds_bucket` filtered by `destination_workload="utility-frontend"` for P99 latency.
- `istio_requests_total` with response-code labels for availability and 5xx burn-rate alerts.
- Envoy access logs tagged with `security_policy="strict-mtls"` for security review evidence.

Dashboards should include request rate, P50/P95/P99 latency, 4xx/5xx error rates, active canary weights, mTLS mode, and authorization-denied counts.

## Deployment runbook

1. Apply the mesh manifest: `kubectl apply -f deploy/istio/utility-frontend-mtls.yaml`.
2. Confirm sidecar injection on new pods: `kubectl -n utility-frontend get pods -o jsonpath='{.items[*].spec.containers[*].name}'`.
3. Confirm strict mTLS: `istioctl authn tls-check deploy/utility-frontend -n utility-frontend`.
4. Start at the 5% green route and watch the dashboard for at least 15 minutes.
5. Advance canary weights only when latency, error-rate, and authorization-denied alerts stay green.
6. Promote green to 100% or restore blue to 100% if a rollback gate triggers.

## Security review checklist

- `PeerAuthentication` remains `STRICT` for the namespace.
- `AuthorizationPolicy` contains only required principals, methods, and ports.
- Dashboard evidence covers latency, availability, and mTLS authorization outcomes.
- Runbook records the exact manifest version, rollout timestamps, and rollback decision points.

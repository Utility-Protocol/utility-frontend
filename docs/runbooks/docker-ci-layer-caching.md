# Docker CI layer caching runbook

## Architecture

The frontend container build is split into deterministic stages so GitHub Actions can reuse expensive layers across pull requests and pushes:

1. `deps` copies only `package.json` and `package-lock.json`, then runs `npm ci` with a BuildKit npm cache mount.
2. `builder` reuses `deps`, copies application source, and runs `npm run build` with a BuildKit cache mount for `.next/cache`.
3. `runner` copies only the Next.js standalone server, static assets, and `public/` files into a non-root production image.

The `docker-image` CI job uses `docker/build-push-action` with the GitHub Actions cache backend (`type=gha`) and a stable `utility-frontend` scope. The job builds but does not push images, which validates the production Docker path without publishing unreviewed artifacts from pull requests.

## Monitoring and alerting

Review these signals on every CI run:

- Docker build duration: compare the `Build Docker image with layer cache` step duration against recent successful runs.
- Cache reuse: expand the Buildx logs and confirm dependency/build layers are restored instead of rebuilt after lockfile-stable changes.
- Next.js build cache: check the `Restore Next.js build cache` step in the `Build` job for cache hits on source-only changes.
- Security posture: verify the final image keeps `NODE_ENV=production`, disables Next telemetry, and runs as the unprivileged `nextjs` user.

Alert the owning team if Docker build duration regresses by more than 50% for three consecutive runs, if cache restore fails across both `main` and pull-request builds, or if the build starts pushing images from pull-request events.

## Deployment guidance

Use the image produced from `main` as a blue-green candidate in the deployment platform. Promote it through a canary window before full traffic cutover, watching application latency, error rate, and container restart count. Roll back to the previous green image if any critical path exceeds the service SLO or if availability drops below target.

## Troubleshooting

- If dependency layers rebuild unexpectedly, check whether `package-lock.json` changed.
- If source layers rebuild but dependencies are reused, this is expected for application code changes.
- If Next.js standalone files are missing, confirm `next.config.ts` still sets `output: "standalone"`.
- If cache storage fills up, adjust the Buildx cache `scope` or prune old GitHub Actions caches from repository settings.

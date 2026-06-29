# predictify-backend

[![CI](https://github.com/omosvico/predictify-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/omosvico/predictify-backend/actions/workflows/ci.yml)

Backend API for **Predictify** — a Stellar/Soroban prediction-markets dApp.

This service indexes on-chain market state from the Predictify Soroban contract, exposes a REST API for the frontend, handles wallet-based authentication, and ships notifications + leaderboards.

## Stack

- **Node.js 20** + **TypeScript**
- **Express** for HTTP
- **Drizzle ORM** + **PostgreSQL** for persistence
- **zod** for env + request validation
- **pino** for structured logging
- **JWT (jsonwebtoken)** for wallet-based session auth
- **Stellar SDK** for Soroban RPC + Horizon
- **Jest** + **supertest** for tests

## Quick start

```bash
cp .env.example .env        # copy the template
# Edit .env — set JWT_SECRET, DATABASE_URL, and PREDICTIFY_CONTRACT_ID
# (all other keys have working testnet defaults)

npm install
npm run check-env           # validate .env before touching the DB
npm run db:migrate
npm run dev                  # predev hook re-runs check-env automatically
```

Once running:

- **Swagger UI** → http://localhost:3000/docs *(non-production only; set `ENABLE_DOCS=true` to enable in production)*
- **OpenAPI JSON** → http://localhost:3000/openapi.json *(always available)*
- **Audit export** → `GET /api/admin/audit/export` streams admin audit logs as `application/x-ndjson`

## Indexer gap scan

The gap-scan worker detects missing ledger ranges in `indexer_events` between the durable cursor and chain tip, emits `indexer_gap_detected_total{from,to}`, and self-heals via `backfillRange`:

```bash
npm run indexer:gap-scan
```

Configure via `INDEXER_GAP_SCAN_INTERVAL_MS`, `INDEXER_REWIND_LEDGERS`, and `INDEXER_BACKFILL_CHUNK_SIZE` in `.env`.

## Layout

```
src/
  config/      env + logger
  routes/      health, markets (more to come)
  services/    domain services
  workers/     indexer gap scan worker
  metrics/     in-process counters (indexer_gap_detected_total)
  middleware/  errorHandler, auth (planned)
  workers/     long-running processes (Soroban indexer)
  db/          drizzle schema, client, repositories
tests/         jest tests
drizzle/       generated migrations + meta
scripts/       dev helpers (check-drizzle-drift.ts)
.github/
  workflows/   CI pipeline (lint, test, drift check, migrate)
```

## Roadmap

This starter is intentionally minimal. The full backlog is tracked in GitHub Issues under the **OFFICIAL CAMPAIGN** label. Major themes:

- Wallet-based auth (Stellar address challenge/signature → JWT)
- Market CRUD + caching layer
- Soroban-RPC indexer with reorg/gap handling
- Predictions + claims endpoints
- Leaderboards & user profiles
- Webhook delivery + DLQ
- Observability (metrics, tracing, /readyz with deep checks)
- OpenAPI spec + contract tests

## Auth Refresh Flow

- `POST /api/auth/refresh` accepts `{ "refreshToken": "<opaque token>" }`, revokes the presented refresh token, and returns a fresh `accessToken` plus a rotated `refreshToken`.
- Refresh tokens are stored only as SHA-256 hashes in the `refresh_tokens` table. The raw bearer token is generated once and is never persisted.
- If a revoked refresh token is presented again, the service treats it as suspected theft and revokes every still-active token in the same `familyId`.
- `POST /api/auth/logout` accepts the same body and revokes the remaining active tokens in that refresh-token family.

## Refresh Token Tests

```bash
npm test -- tests/refreshToken.test.ts
```

The refresh-token test suite covers rotation, expiry handling, reuse detection, logout family revocation, and hash-only storage.

## Social graph

Follow graph mutations are exposed at:

- `POST /api/users/:addr/follow`
- `DELETE /api/users/:addr/follow`

These endpoints require authentication, enforce `users.is_private`, update
cached `followers_count` and `following_count` values transactionally, and
write structured audit entries with the request correlation ID.

## Run with Docker

You can spin up the entire Predictify stack (API, Indexer, and PostgreSQL) using Docker Compose.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed and running.
- A local `.env` file generated from `.env.example`. Ensure `DATABASE_URL` is set to `postgres://postgres:postgres@db:5432/predictify` for Docker compatibility.

### Commands

1. **Start the stack:**
   ```bash
   docker compose up --build
   ```
   
2. Verify the services:
   Once booted, the API will be available at http://localhost:3001.
   Check the health endpoint:
   ```bash
   curl localhost:3001/health
   # Expected response: 200 OK
   ```
### Notes
* The migrate service runs automatically on startup to ensure the database schema is up-to-date before the API and Indexer start.

* The indexer service runs as a persistent container; check the logs with docker compose logs -f indexer if you encounter sync issues.

### Implementation Notes for Review
*   **Performance:** Multi-stage builds reduce the final image size by excluding source code and dev dependencies.
*   **Security:** By using `USER node` and `slim` base images, we reduce the attack surface.
*   **Resilience:** The `depends_on` condition using `service_healthy` or `service_completed_successfully` ensures the database is ready and migrations are applied before application services boot, preventing race conditions.
*   **Supply-Chain:** The base image is pinned by a specific digest. **Important:** When you run this, verify the digest matches your local build requirements, or update it to the latest `node:20-bookworm-slim` digest if you prefer the absolute latest patch version.

## License

MIT

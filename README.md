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
cp .env.example .env   # fill JWT_SECRET, DATABASE_URL, contract id
npm install
npm run db:migrate
npm run dev
```

## Configuration

Environment variables are validated at startup via a [zod](https://zod.dev) schema in `src/config/env.ts`.
The service **will refuse to boot** if required values are missing or invalid.

**Important constraint:** `JWT_TTL_SECONDS` must be >= `WORKER_HEARTBEAT_SECONDS * 2`.
This prevents mid-flight worker requests from failing with `TokenExpired` when the JWT
lifetime is shorter than two worker heartbeat cycles. A startup warning is also logged
when the TTL is within 10% of that minimum bound.

## Layout

```
src/
  config/      env + logger
  routes/      health, markets (more to come)
  services/    domain services (incl. indexerService.pollOnce)
  middleware/  errorHandler, auth (planned)
  workers/     long-running processes (Soroban indexer)
  db/          drizzle schema, client, repositories
tests/         jest tests
docs/          architecture docs
scripts/       dev helpers
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

## License

MIT

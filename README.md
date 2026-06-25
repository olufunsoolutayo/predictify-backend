# predictify-backend

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

`DATABASE_URL` is required in development and production. The markets API reads from
Postgres with Drizzle and returns active, non-archived rows from the `markets` table.

## Markets API

```http
GET /api/markets?limit=50&offset=0
```

`limit` is optional and capped at 100; `offset` defaults to 0. Responses contain
ISO-8601 `resolutionTime` values.

## Layout

```
src/
  config/      env + logger
  routes/      health, markets (more to come)
  services/    domain services
  middleware/  errorHandler, auth (planned)
  db/          drizzle schema
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

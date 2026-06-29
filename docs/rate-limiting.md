# Anonymous rate limiting

Public read endpoints (`GET /api/markets`, `GET /api/leaderboard`) are throttled
per client IP using a sliding-window counter. Authenticated requests that include
a `Bearer` token bypass the limiter.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANON_RATE_LIMIT_WINDOW_MS` | `60000` | Sliding window length in milliseconds |
| `ANON_RATE_LIMIT_MAX` | `60` | Maximum anonymous requests per IP per window |
| `TRUST_PROXY` | `false` | When `true`, client IP is read from `X-Forwarded-For` |

Set `TRUST_PROXY=true` only when the app runs behind a trusted reverse proxy
that strips untrusted `X-Forwarded-For` values.

## Response when limited

HTTP **429 Too Many Requests** with:

- `Retry-After` header — seconds until the oldest request in the window expires
- Body: `{ "error": { "code": "rate_limit_exceeded", "requestId": "<id>" } }`

## Implementation

- Middleware: [`src/middleware/rateLimitAnon.ts`](../src/middleware/rateLimitAnon.ts)
- Applied on: `marketsRouter`, `leaderboardRouter`
- Tests: [`tests/rateLimitAnon.test.ts`](../tests/rateLimitAnon.test.ts)

## Verification

```bash
npm test -- tests/rateLimitAnon.test.ts
```

## Authenticated market-comment writes

`POST /api/markets/:id/comments` is authenticated and rate limited per user after JWT authentication succeeds. The default limit is **5 comments per user per minute**. Blocked requests return HTTP `429` with `error.code` set to `rate_limited`.

The endpoint accepts JSON `{ "content": "..." }`, trims surrounding whitespace, stores comments up to 1000 characters, and returns the created comment with HTTP `201`.

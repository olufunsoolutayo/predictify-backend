# Webhook events

Predictify sends webhook deliveries as JSON `POST` requests. Each delivery uses
`X-Predictify-Event` for the event name, `X-Predictify-Delivery` for the unique
delivery id, and `X-Predictify-Signature` for the HMAC signature.

## `predictions.created`

Emitted after a prediction is accepted and persisted for a market. Consumers
should treat deliveries as at-least-once and deduplicate with
`X-Predictify-Delivery` or `prediction.id`.

### Payload

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | Always `predictions.created`. |
| `prediction.id` | UUID string | Prediction identifier. |
| `prediction.marketId` | string | Market receiving the prediction. |
| `prediction.userId` | UUID string | Internal Predictify user identifier. |
| `prediction.outcome` | string | Selected market outcome. |
| `prediction.amount` | numeric string | Prediction amount in the smallest supported unit. |
| `prediction.txHash` | string | Client/on-chain transaction hash associated with the prediction. |
| `prediction.status` | string | Initial prediction status, usually `pending`. |
| `prediction.createdAt` | ISO-8601 string | Time the prediction row was created. |
| `timestamp` | ISO-8601 string | Event timestamp; matches `prediction.createdAt`. |

### Example

```json
{
  "event": "predictions.created",
  "prediction": {
    "id": "11111111-1111-4111-8111-111111111111",
    "marketId": "mkt-2026-election",
    "userId": "22222222-2222-4222-8222-222222222222",
    "outcome": "YES",
    "amount": "10000000",
    "txHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "status": "pending",
    "createdAt": "2026-06-29T12:00:00.000Z"
  },
  "timestamp": "2026-06-29T12:00:00.000Z"
}
```

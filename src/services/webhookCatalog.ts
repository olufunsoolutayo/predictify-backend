import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

export const predictionCreatedPayloadSchema = z.object({
  event: z.literal("predictions.created"),
  prediction: z.object({
    id: z.string().uuid(),
    marketId: z.string().min(1),
    userId: z.string().uuid(),
    outcome: z.string().min(1),
    amount: z.string().regex(/^\d+(?:\.\d+)?$/, "amount must be a numeric string"),
    txHash: z.string().min(1),
    status: z.string().min(1),
    createdAt: isoDateTime,
  }),
  timestamp: isoDateTime,
});

export type PredictionCreatedPayload = z.infer<typeof predictionCreatedPayloadSchema>;

export interface PredictionCreatedInput {
  id: string;
  marketId: string;
  userId: string;
  outcome: string;
  amount: string;
  txHash: string;
  status: string;
  createdAt: Date | string;
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function buildPredictionCreatedPayload(prediction: PredictionCreatedInput): PredictionCreatedPayload {
  const createdAt = toIsoTimestamp(prediction.createdAt);

  return predictionCreatedPayloadSchema.parse({
    event: "predictions.created",
    prediction: {
      id: prediction.id,
      marketId: prediction.marketId,
      userId: prediction.userId,
      outcome: prediction.outcome,
      amount: prediction.amount,
      txHash: prediction.txHash,
      status: prediction.status,
      createdAt,
    },
    timestamp: createdAt,
  });
}

export const webhookEventCatalog = {
  "predictions.created": {
    event: "predictions.created",
    description: "Emitted after a new prediction record is accepted for a market.",
    schema: predictionCreatedPayloadSchema,
    example: buildPredictionCreatedPayload({
      id: "11111111-1111-4111-8111-111111111111",
      marketId: "mkt-2026-election",
      userId: "22222222-2222-4222-8222-222222222222",
      outcome: "YES",
      amount: "10000000",
      txHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      status: "pending",
      createdAt: "2026-06-29T12:00:00.000Z",
    }),
  },
} as const;

export type WebhookEventType = keyof typeof webhookEventCatalog;

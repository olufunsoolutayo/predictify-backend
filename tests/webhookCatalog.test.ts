import {
  buildPredictionCreatedPayload,
  predictionCreatedPayloadSchema,
  webhookEventCatalog,
} from "../src/services/webhookCatalog";

describe("webhook event catalog", () => {
  it("documents predictions.created with a valid structured example", () => {
    const event = webhookEventCatalog["predictions.created"];

    expect(event.event).toBe("predictions.created");
    expect(() => event.schema.parse(event.example)).not.toThrow();
    expect(event.example.prediction.status).toBe("pending");
  });

  it("builds a predictions.created payload from a prediction row", () => {
    const payload = buildPredictionCreatedPayload({
      id: "11111111-1111-4111-8111-111111111111",
      marketId: "mkt-1",
      userId: "22222222-2222-4222-8222-222222222222",
      outcome: "NO",
      amount: "2500000",
      txHash: "0xabc123",
      status: "pending",
      createdAt: new Date("2026-06-29T13:14:15.000Z"),
    });

    expect(payload).toEqual({
      event: "predictions.created",
      prediction: {
        id: "11111111-1111-4111-8111-111111111111",
        marketId: "mkt-1",
        userId: "22222222-2222-4222-8222-222222222222",
        outcome: "NO",
        amount: "2500000",
        txHash: "0xabc123",
        status: "pending",
        createdAt: "2026-06-29T13:14:15.000Z",
      },
      timestamp: "2026-06-29T13:14:15.000Z",
    });
  });

  it("rejects malformed predictions.created payloads", () => {
    const result = predictionCreatedPayloadSchema.safeParse({
      event: "predictions.created",
      prediction: {
        id: "not-a-uuid",
        marketId: "mkt-1",
        userId: "22222222-2222-4222-8222-222222222222",
        outcome: "YES",
        amount: "ten lumens",
        txHash: "0xabc123",
        status: "pending",
        createdAt: "2026-06-29T13:14:15.000Z",
      },
      timestamp: "2026-06-29T13:14:15.000Z",
    });

    expect(result.success).toBe(false);
  });
});

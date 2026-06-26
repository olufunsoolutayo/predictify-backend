import {
  resolveMarket,
  DrizzleMarketResolutionRepo,
  type MarketResolvedEvent,
  type MarketResolutionRepo,
  type WebhookEmitter,
} from "../services/marketResolutionService";
import { db } from "../db";
import { logger } from "../config/logger";

export type { MarketResolvedEvent };

/**
 * Worker that processes market_resolved events emitted by the on-chain indexer.
 *
 * Usage — call handleEvent() for each event the indexer surfaces:
 *
 *   await marketResolverWorker.handleEvent({
 *     marketId: "...",
 *     winningOutcome: "YES",
 *     ledger: 99_000,
 *     timestamp: 1_700_000_000,
 *   });
 *
 * The call is idempotent: replaying the same event is always a safe no-op.
 * Errors propagate to the caller so the indexer loop can decide on retry policy.
 */
export class MarketResolverWorker {
  private readonly repo: MarketResolutionRepo;
  private readonly emitWebhook: WebhookEmitter | undefined;

  constructor(
    repo: MarketResolutionRepo = new DrizzleMarketResolutionRepo(db),
    emitWebhook?: WebhookEmitter,
  ) {
    this.repo = repo;
    this.emitWebhook = emitWebhook;
  }

  async handleEvent(event: MarketResolvedEvent): Promise<void> {
    logger.info(
      { marketId: event.marketId, ledger: event.ledger },
      "market_resolver: received event",
    );

    const { processed } = await resolveMarket(this.repo, event, this.emitWebhook);

    if (processed) {
      logger.info(
        { marketId: event.marketId, winningOutcome: event.winningOutcome },
        "market_resolver: market resolved successfully",
      );
    }
  }
}

/** Singleton for use by the indexer polling loop. */
export const marketResolverWorker = new MarketResolverWorker();

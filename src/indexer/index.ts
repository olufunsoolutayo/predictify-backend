import { indexerPollsTotal } from "../metrics/registry";

export async function runPollCycle(): Promise<void> {
  indexerPollsTotal.inc();
}

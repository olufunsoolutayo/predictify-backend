import { webhookDeliveriesTotal } from "../metrics/registry";

export async function deliverWebhook(): Promise<void> {
  webhookDeliveriesTotal.inc({ status: "success" });
}

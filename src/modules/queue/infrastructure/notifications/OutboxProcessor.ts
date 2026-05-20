import cron from "node-cron";

export class OutboxProcessor {
  public start(): void {
    cron.schedule("*/30 * * * * *", () => {
      return;
    });
  }
}

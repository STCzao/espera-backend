import type { Repository } from "../../../shared/kernel/Repository";
import type { ServiceWindow } from "./ServiceWindow";

export interface IServiceWindowRepo extends Repository<ServiceWindow> {
  findByQueueId(queueId: string): Promise<ServiceWindow[]>;
}

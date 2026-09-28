import type { Server as SocketIOServer } from "socket.io";

export class SocketIOEmitter {
  public constructor(private readonly io: SocketIOServer) {}

  public emitQueueUpdate(queueId: string, payload: unknown): void {
    this.io.to(`queue:${queueId}`).emit("queue:update", payload);
  }
}

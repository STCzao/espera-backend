import { EventEmitter } from "node:events";

export type DomainEvents = {
  "turn.created": {
    turnId: string;
    businessId: string;
    queueId: string;
  };
  "turn.called": {
    turnId: string;
    businessId: string;
    queueId: string;
    counter?: string;
  };
  "turn.cancelled": {
    turnId: string;
    businessId: string;
    queueId: string;
    reason?: string;
  };
  "user.registered": {
    userId: string;
    email: string;
  };
};

export class EventBus {
  private readonly emitter = new EventEmitter();

  public emit<EventName extends keyof DomainEvents & string>(
    eventName: EventName,
    payload: DomainEvents[EventName]
  ): boolean {
    return this.emitter.emit(eventName, payload);
  }

  public on<EventName extends keyof DomainEvents & string>(
    eventName: EventName,
    listener: (payload: DomainEvents[EventName]) => void
  ): this {
    this.emitter.on(eventName, listener);
    return this;
  }

  public off<EventName extends keyof DomainEvents & string>(
    eventName: EventName,
    listener: (payload: DomainEvents[EventName]) => void
  ): this {
    this.emitter.off(eventName, listener);
    return this;
  }
}

export const domainEventBus = new EventBus();

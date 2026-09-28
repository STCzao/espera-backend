import type { IUnitOfWork } from "../../src/shared/kernel/UnitOfWork";

/**
 * In-memory repos don't have a real transaction to join, so this just runs
 * the work directly — good enough to exercise a use case's orchestration
 * (which repo.save() calls happen, in what order, with what data) and to
 * confirm a mid-way failure propagates instead of being swallowed. Whether
 * a failure actually rolls back prior writes can only be proven against
 * real Postgres — see the matching *.integration.test.ts for that.
 */
export class InMemoryUnitOfWork implements IUnitOfWork {
  public async run<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return work(undefined);
  }
}

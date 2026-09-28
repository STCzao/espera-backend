export interface ShutdownTarget {
  name: string;
  close: () => Promise<void> | void;
}

interface ShutdownLogger {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface ShutdownOptions {
  /** Closed one at a time, in this order: stop taking traffic first, release the data stores last. */
  targets: ShutdownTarget[];
  logger: ShutdownLogger;
  /** Hard ceiling; a target that hangs must not keep a redeploy waiting forever. */
  timeoutMs?: number;
  exit?: (code: number) => void;
}

let shuttingDown = false;

/** True once a shutdown signal was received — lets /health tell the load balancer to drain. */
export const isShuttingDown = (): boolean => shuttingDown;

/**
 * Builds the SIGTERM/SIGINT handler. Orchestrators (Docker, Kubernetes,
 * PaaS) send SIGTERM on every deploy and then SIGKILL after a grace period:
 * without this, in-flight requests are cut mid-response, Postgres connections
 * are dropped instead of released and Redis is left to time the client out.
 * Calling it twice (a second signal while draining) is a no-op.
 */
export const createShutdownHandler = ({
  targets,
  logger,
  timeoutMs = 10_000,
  exit = (code) => process.exit(code),
}: ShutdownOptions) => {
  return async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutdown signal received, draining");

    const forceExit = setTimeout(() => {
      logger.error({ timeoutMs }, "Graceful shutdown timed out, forcing exit");
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    let failed = false;
    for (const target of targets) {
      try {
        await target.close();
        logger.info({ target: target.name }, "Shutdown step done");
      } catch (error) {
        failed = true;
        logger.error({ err: error, target: target.name }, "Shutdown step failed");
      }
    }

    clearTimeout(forceExit);
    exit(failed ? 1 : 0);
  };
};

/** Test-only: the module keeps process-wide state, which tests must be able to reset. */
export const resetShutdownStateForTests = (): void => {
  shuttingDown = false;
};

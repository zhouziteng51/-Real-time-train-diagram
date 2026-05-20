import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "metro-ops-backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function logError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  logger.error(
    {
      event,
      err:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      ...context,
    },
    event,
  );
}

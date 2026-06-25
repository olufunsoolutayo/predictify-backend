import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { getRequestId } from "../lib/requestContext";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // getRequestId() works here because the ALS middleware ran before us.
  // Fall back to req.id (set by pinoHttp) in the unlikely event the store is
  // not populated (e.g. the error was thrown before the ALS middleware ran).
  const requestId = getRequestId() ?? (req.id as string | undefined);

  logger.error(
    { err, path: req.path, method: req.method, reqId: requestId },
    "request_failed",
  );

  const status = (err as { status?: number }).status ?? 500;

  res.status(status).json({
    error: {
      code: status === 500 ? "internal_error" : "request_failed",
      // Expose the request ID so clients can quote it when reporting issues.
      requestId,
    },
  });
}

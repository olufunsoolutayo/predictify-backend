import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration } from "./registry";

function sanitizeRoute(route: string): string {
  return route
    .replace(/\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    const routeTemplate: string = req.route?.path
      ? (req.baseUrl || "") + req.route.path
      : req.path;

    const route = sanitizeRoute(routeTemplate);

    httpRequestDuration.observe({ route, status: res.statusCode }, durationSec);
  });

  next();
}

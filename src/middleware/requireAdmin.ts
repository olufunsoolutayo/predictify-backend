  
/* eslint-disable @typescript-eslint/no-namespace */ 
/**
 * requireAdmin — Express middleware that enforces admin-only access.
 *
 * Expects:  Authorization: Bearer <jwt>
 * The JWT must be signed with a key from the key ring (src/utils/keyRing.ts)
 * and carry { role: "admin" }. The verified subject (Stellar address) is
 * attached as req.adminAddress for downstream use in audit logging and
 * rate-limit keying.
 *
 * Returns 403 for any of: missing header, invalid signature, wrong role.
 * Never reveals why verification failed (prevents enumeration).
 */

import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/jwtService";

// Augment Express Request so downstream handlers can read the admin identity
// without casting.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminAddress?: string;
    }
  }
}

interface AdminTokenPayload {
  sub?: string;
  role?: string;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(403).json({ error: { code: "forbidden" } });
    return;
  }

  const token = auth.slice(7);

  try {
    const payload = verifyAccessToken(token) as AdminTokenPayload;

    if (payload.role !== "admin" || !payload.sub) {
      res.status(403).json({ error: { code: "forbidden" } });
      return;
    }

    req.adminAddress = payload.sub;
    next();
  } catch {
    // Covers expired, malformed, and wrong-key tokens
    res.status(403).json({ error: { code: "forbidden" } });
  }
}

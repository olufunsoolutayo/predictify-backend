/**
 * scopeAuth — per-key scope enforcement middleware
 * -------------------------------------------------
 * API keys (JWTs) carry a `scopes` claim: an array of strings drawn from the
 * ApiScope union.  Every protected route declares the minimum scope it needs;
 * this middleware rejects requests whose token lacks that scope.
 *
 * Scope hierarchy
 * ---------------
 *   admin  ⊇  write  ⊇  read
 *
 * A token that holds "admin" satisfies any requireScope check.
 * A token that holds "write" satisfies "write" and "read" checks.
 * A token that holds "read" satisfies only "read" checks.
 *
 * Usage
 * -----
 *   import { requireScope } from "../middleware/scopeAuth";
 *
 *   router.get("/markets",  optionalAuth, requireScope("read"),  handler);
 *   router.post("/markets", requireAuth,  requireScope("write"), handler);
 *   router.use(requireAdmin, requireScope("admin"));
 *
 * Token format
 * ------------
 *   Standard JWT signed with JWT_SECRET (HS256).
 *   The `scopes` claim must be a JSON array of ApiScope values.
 *   Tokens without a `scopes` claim are treated as having no scopes.
 *
 * Error responses
 * ---------------
 *   401  { error: { code: "unauthenticated" } }  — no valid token present
 *   403  { error: { code: "insufficient_scope",
 *                   required: "<scope>" } }        — token present but lacks scope
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Scope definitions
// ---------------------------------------------------------------------------

/** All valid scope values. */
export const API_SCOPES = ["read", "write", "admin"] as const;

/** A single valid scope value. */
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Scope hierarchy: every scope in the value array satisfies the key scope.
 * "admin" subsumes everything; "write" subsumes "read".
 */
const SCOPE_SATISFIERS: Record<ApiScope, readonly ApiScope[]> = {
  read: ["read", "write", "admin"],
  write: ["write", "admin"],
  admin: ["admin"],
};

// ---------------------------------------------------------------------------
// JWT parsing helpers
// ---------------------------------------------------------------------------

interface ScopedPayload extends JwtPayload {
  scopes?: unknown;
}

/**
 * Verifies the Bearer JWT and extracts its `scopes` claim.
 * Returns the scopes array on success, or `null` if the token is absent /
 * invalid / unsigned with the expected key.
 */
function extractScopes(req: Request): ApiScope[] | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  let payload: ScopedPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as ScopedPayload;
  } catch {
    // Expired, forged, or wrong-audience tokens → treat as unauthenticated.
    return null;
  }

  // Parse the scopes claim: must be an array of known scope strings.
  const raw = payload.scopes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s as string),
  );
}

/**
 * Returns true if any scope in `grantedScopes` satisfies `required`.
 */
function hasScope(grantedScopes: ApiScope[], required: ApiScope): boolean {
  return grantedScopes.some((granted) =>
    SCOPE_SATISFIERS[required].includes(granted),
  );
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * `requireScope(scope)` — Express middleware factory.
 *
 * Returns a `RequestHandler` that:
 *   1. Verifies the Bearer JWT (independent of `requireAuth` — can be used
 *      standalone or after `requireAuth`).
 *   2. Checks that the token's `scopes` claim satisfies `scope`.
 *   3. Attaches `req.apiKeyScopes` for downstream inspection.
 *
 * @param required  The minimum scope the caller must hold.
 */
export function requireScope(required: ApiScope): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scopes = extractScopes(req);

    if (scopes === null) {
      // No token or unverifiable token.
      logger.warn(
        { path: req.path, method: req.method, required },
        "scope_auth_unauthenticated",
      );
      res.status(401).json({ error: { code: "unauthenticated" } });
      return;
    }

    // Attach to request for downstream logging / audit use.
    req.apiKeyScopes = scopes;

    if (!hasScope(scopes, required)) {
      logger.warn(
        {
          path: req.path,
          method: req.method,
          required,
          granted: scopes,
        },
        "scope_auth_insufficient",
      );
      res
        .status(403)
        .json({ error: { code: "insufficient_scope", required } });
      return;
    }

    next();
  };
}

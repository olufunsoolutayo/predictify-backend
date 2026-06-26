/**
 * Augments the Express `Request` type so that TypeScript knows about
 * `req.user` on every route handler — no more `any` casts.
 *
 * This file is a pure ambient declaration; it has no runtime footprint.
 */

import "express";

declare module "express" {
  interface Request {
    /**
     * Populated by `requireAuth` (or `optionalAuth`) after a valid JWT is
     * verified and the corresponding user row is loaded from the database.
     *
     * - `requireAuth`  → always defined on the handler (middleware returns 401
     *                    before the handler runs if the token is absent/invalid)
     * - `optionalAuth` → defined only when a valid token was supplied; `undefined`
     *                    otherwise (handler must check before use)
     */
    user?: {
      /** Database UUID primary key */
      id: string;
      /** Stellar G-address that owns this account */
      stellarAddress: string;
    };
  }
}

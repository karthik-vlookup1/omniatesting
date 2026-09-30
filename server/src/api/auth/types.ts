// Brings in pino-http's `req.log` typing.
import type {} from 'pino-http';
import type { ActorDb } from '../../db/context.js';
import type { AuthUser } from '../../services/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `authenticate` when the session cookie is valid. */
      user?: AuthUser;
      /** Raw session token from the cookie (never logged). */
      sessionToken?: string;
      /** Database handle whose transactions are audited as the current user. */
      db: ActorDb;
    }
  }
}

export {};

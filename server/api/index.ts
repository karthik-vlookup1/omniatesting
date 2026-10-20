/**
 * Vercel Function entry: the whole Express API as one function (see server/vercel.json).
 *
 * Builds the app without app.listen() and without the scheduled jobs that src/api/app.ts main()
 * starts (Veco sync, Xero worker, charge generation, session purge); a function instance does
 * not live long enough to run them. The VECO push gateway is wired, because its MCP client is
 * stateless HTTP per call.
 */
import { createApp } from '../src/api/app.js';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { createLogger } from '../src/lib/logger.js';
import { loadVecoPushWiring } from '../src/services/veco-push/wiring.js';

// Vercel's Neon integration sets the pooled endpoint as DATABASE_URL (NEON_-prefixed when the
// integration was given that prefix). The pool sets app.hash_key once per connection, which a
// transaction pooler can lose, so prefer the direct endpoint. Same order as scripts/vercel-build.mjs.
const config = loadConfig({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
});
const logger = createLogger({ level: config.logLevel, pretty: false });
const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 3 }, logger);

// 'off': a bad optional VECO setting must not turn every API route into a cold-start 500.
const vecoPush = loadVecoPushWiring(process.env, logger, { onInvalid: 'off' });

export default createApp({ config, pool, logger, vecoPush: { gateway: vecoPush.gateway } });

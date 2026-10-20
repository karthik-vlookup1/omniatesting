# recon-605: VECO push on Vercel

## Goal
Wire the VECO push gateway into the Vercel function (server/api/index.ts) through one shared helper that app.ts main()
also uses. URL set -> mode mcp, configured. Unset -> off, "not configured". The URL is never logged or returned.

## Files
- CREATE server/src/services/veco-push/wiring.ts (shared helper)
- MODIFY server/src/api/app.ts (main() uses the helper, unused imports removed)
- MODIFY server/api/index.ts (passes vecoPush into createApp)
- CREATE server/test/unit/veco-push-wiring.test.ts

## mcp-client in a serverless function (checked server/src/jobs/veco-sync/mcp-client.ts)
createMcpSqlClient only stores the URL. It opens no socket and makes no fetch when it is built. Each queryRows/executeBatch
opens a new MCP session (initialize, notifications/initialized, tools/call) over plain fetch with a 120 s
AbortSignal.timeout. Nothing is kept between calls except an id counter, so a frozen or recycled instance loses nothing.
**No change to mcp-client.ts.** Building the gateway at module load in api/index.ts costs nothing, and no network call happens until a push request.

## Steps
1. wiring.ts: add `export function createVecoPushGateway(config: VecoPushConfig): VecoGateway | null`. Move the switch
   from app.ts lines 204-209 here unchanged: 'mcp' -> `createSqlGateway(createMcpSqlClient({ url: config.rwMcpUrl,
   clientName: 'omnia-recon-veco-push' }))`, 'fake' -> `createSqlGateway(createFakeVecoSql(DEMO_FAKE_SEED))`, 'off' -> null.
   Reason: both entry points build the gateway the same way, so they cannot drift.
2. wiring.ts: add `export type VecoPushLogger = Pick<Logger, 'info' | 'error'>` (Logger from ../../lib/logger.js) and
   the loader below. Reason: the fallback and the log line can then be unit-tested without importing api/index.ts.
   ```ts
   export function loadVecoPushWiring(env: NodeJS.ProcessEnv, logger: VecoPushLogger,
     opts: { onInvalid: 'throw' | 'off' }): { mode: VecoPushConfig['mode']; gateway: VecoGateway | null } {
     let config: VecoPushConfig;
     try { config = loadVecoPushConfig(env); } catch (err) {
       if (opts.onInvalid === 'throw') throw err;
       logger.error({ reason: err instanceof Error ? err.message : 'unknown' }, 'veco push off: invalid configuration');
       return { mode: 'off', gateway: null };
     }
   ```
   It then does `const gateway = createVecoPushGateway(config)` and logs exactly as app.ts does today:
   `logger.info({ mode: config.mode, configured: Boolean(gateway) }, 'veco push (test database)')`. It returns `{ mode: config.mode, gateway }`.
   Never log `err` itself or `config`. Only the message is logged, and loadVecoPushConfig already keeps the URL out of it.
3. app.ts main(): replace lines 203-210 with `const vecoPush = loadVecoPushWiring(process.env, logger, { onInvalid: 'throw' });`
   and pass `vecoPush: { gateway: vecoPush.gateway }` in the createApp call on line 212. Reason: local behaviour stays the same
   (same log line, a bad config still stops startup).
4. app.ts imports: change line 43 to `import type { SqlSource } from '../jobs/veco-sync/mcp-client.js';`. Delete the imports
   of loadVecoPushConfig, DEMO_FAKE_SEED and createFakeVecoSql. Change line 47 to `import type { VecoGateway } from
   '../services/veco-push/gateway.js';`. Add the wiring.js import. Reason: lint fails on unused imports.
5. api/index.ts: import loadVecoPushWiring. After the pool line add
   `const vecoPush = loadVecoPushWiring(process.env, logger, { onInvalid: 'off' });` and export
   `createApp({ config, pool, logger, vecoPush: { gateway: vecoPush.gateway } })`. Add one sentence to the header comment:
   the VECO push gateway is wired, because its MCP client is stateless HTTP per call. Reason: this fixes the bug. 'off' is chosen
   because a bad optional VECO setting must not turn every API route into a cold-start 500. The page then says
   "not configured" and the Vercel log shows the reason.
6. veco-push-wiring.test.ts (vitest, no network). Use a fake logger `{ info: vi.fn(), error: vi.fn() }` and the secret
   `SECRET='SECRETKEY123'`, with URL `https://rw-mcp.example.test/mcp?key=${SECRET}`. Cases:
   a. createVecoPushGateway off -> null. fake -> object. mcp -> object with insertReceipts, and
      `vi.spyOn(globalThis, 'fetch')` was not called while it was built (lazy, safe for serverless). Restore the spy.
   b. loadVecoPushWiring({NODE_ENV:'production', VECO_RW_MCP_URL:URL}, ..., 'off') -> mode 'mcp', gateway not null,
      info called with `{ mode: 'mcp', configured: true }`, and JSON.stringify of all logger calls does not contain SECRET.
   c. {NODE_ENV:'production'} -> mode 'off', gateway null, info `{ mode: 'off', configured: false }`, error not called.
   d. {NODE_ENV:'production', VECO_PUSH_MODE:'fake'}: with 'throw' -> toThrow('not allowed in production'). With 'off' ->
      `{ mode: 'off', gateway: null }` and error called once, its reason containing 'not allowed in production'.
   e. {NODE_ENV:'production', VECO_PUSH_MODE:'mcp'} with no URL, 'off' -> off, error logged.
   f. {NODE_ENV:'production', VECO_RW_MCP_URL:'not-a-url-' + SECRET}: the 'throw' error message does not contain SECRET,
      and with 'off' the logger calls do not contain SECRET.
   g. {} (development) -> mode 'fake', gateway not null. This keeps the local default.

## Edge cases
- VECO_RW_MCP_URL set to '' on Vercel -> treated as unset -> off.
- NODE_ENV on Vercel is production, so 'fake' can never run there. It is refused, logged, and the push is off.
- VECO_PUSH_MODE=off together with a URL -> off (explicit choice, no error).

## Risks and rollback
- On Vercel, /api/veco-push routes that read migration 021 tables will fail until 021 is applied to the cloud DB
  (vercel-build.mjs skips migrations when VERCEL_ENV !== 'production'). This is out of scope and waits for the user's DB setup.
- No maxDuration in server/vercel.json. A push is several MCP round trips (3 HTTP calls per query) and must finish inside
  Vercel's default function limit. vercel.json is not changed here. Watch the first real push.
- MCP sessions are never closed (same as local). This is unchanged.
- Rollback: revert the commit. api/index.ts goes back to "not configured" and app.ts goes back to the inline switch.

## Out of scope (notes only)
- Applying migration 021 on the cloud DB, and any vercel-build.mjs or vercel.json change.
- Any change to mcp-client.ts, config.ts or the push service.

## Verify
`npm run test:unit -- veco-push`: every veco-push unit file passes, including the new wiring cases a-g.
`npm run test:int -- veco-push`: unchanged and passes (createApp wiring untouched). lint and typecheck exit 0.
Manual check after deploy (user): GET /api/veco-push/status returns configured=true with the URL set and false without it.

## Result
**Status: PASSING** (hx verify recon-605 on 2026-10-20). Unit: 4 files, 58 tests passed (wiring cases a-g new). Integration: 2 files, 18 tests passed (Docker Postgres 5433). Lint and typecheck exit 0. No deviations from plan.
**Files:** wiring.ts (new, shared loader), app.ts (main uses loadVecoPushWiring), api/index.ts (onInvalid 'off'), veco-push-wiring.test.ts (new, 7 cases).
**Open:** Migration 021 on cloud DB waits on production build; vercel.json has no maxDuration—watch first real push.

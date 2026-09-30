/**
 * Express application and server entry point.
 *
 *   createApp(deps)      builds the app (used by the server and by supertest)
 *   tsx src/api/app.ts   loads config, connects to Postgres and listens on PORT
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { loadConfig, type AppConfig } from '../config/env.js';
import { createPool, type Pool } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { isMainModule } from '../lib/is-main.js';
import { createLogger, type Logger } from '../lib/logger.js';
import { purgeExpiredSessions } from '../services/auth.service.js';
import { authenticate, csrfGuard } from './auth/middleware.js';
import { authRouter, usersRouter } from './auth/routes.js';

export interface AppDeps {
  config: AppConfig;
  pool: Pool;
  logger: Logger;
}

export function createApp({ config, pool, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy in production: trust exactly one hop for req.ip / secure cookies.
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: (req) => ({ userId: req.user?.id }),
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Unauthenticated liveness + database check.
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', authenticate(pool), csrfGuard);
  app.use('/api/auth', authRouter({ pool, cookieSecure: config.cookieSecure }));
  app.use('/api/users', usersRouter({ pool }));

  app.use('/api', (_req, _res, next) => next(new AppError('not_found', 'Not found')));
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Malformed JSON body from express.json().
  if (typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
};

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey }, logger);
  await pool.query('SELECT 1');

  const app = createApp({ config, pool, logger });
  const server: Server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'omnia-recon API listening');
  });

  const purge = setInterval(() => {
    purgeExpiredSessions(pool)
      .then((n) => n > 0 && logger.info({ purged: n }, 'expired sessions removed'))
      .catch((err: unknown) => logger.error({ err }, 'session purge failed'));
  }, 60 * 60 * 1000);
  purge.unref();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(purge);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`omnia-recon failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

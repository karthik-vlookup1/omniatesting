import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/**
 * Paths that must never reach a log line. Personal data (NI numbers, bank accounts) and
 * credentials are redacted wherever they appear in a logged object.
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.niNumber',
  '*.ni_number',
  '*.accountNumber',
  '*.account_number',
  '*.sortCode',
  '*.sort_code',
];

export interface LoggerConfig {
  level: string;
  pretty?: boolean;
}

export function createLogger({ level, pretty = false }: LoggerConfig): Logger {
  const options: LoggerOptions = {
    level,
    base: { service: 'omnia-recon' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (pretty) {
    options.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
  }
  return pino(options);
}

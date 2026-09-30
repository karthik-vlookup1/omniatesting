/**
 * Create an app user, or reset an existing user's name, role and password.
 *
 *   npm run user:create -- --email admin@example.com --name "Admin" --role admin
 *
 * The password is read from OMNIA_NEW_USER_PASSWORD if set, otherwise prompted for (hidden,
 * asked twice) on a terminal, or read from the first line of stdin when piped.
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config/env.js';
import { createPool } from '../db/pool.js';
import { isMainModule } from '../lib/is-main.js';
import { createLogger } from '../lib/logger.js';
import { ROLES, upsertUser, type Role } from '../services/auth.service.js';

async function readStdinLine(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += String(chunk);
  return data.split(/\r?\n/)[0] ?? '';
}

function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.OMNIA_NEW_USER_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return readStdinLine();
  const first = await promptHidden('Password (min 12 characters): ');
  const second = await promptHidden('Repeat password: ');
  if (first !== second) throw new Error('Passwords do not match');
  return first;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'staff' },
    },
  });
  if (!values.email || !values.name) {
    throw new Error('Usage: user:create -- --email <email> --name "<full name>" [--role admin|accounts|staff|readonly]');
  }
  if (!(ROLES as readonly string[]).includes(values.role)) {
    throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  }

  const config = loadConfig();
  const logger = createLogger({ level: 'warn' });
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 1 }, logger);
  try {
    const password = await readPassword();
    const { created } = await upsertUser(pool, {
      email: values.email,
      fullName: values.name,
      role: values.role as Role,
      password,
    });
    process.stdout.write(`${created ? 'Created' : 'Updated'} ${values.email.toLowerCase()} (${values.role})\n`);
  } finally {
    await pool.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    const message =
      typeof err === 'object' && err !== null && 'issues' in err
        ? (err as { issues: { message: string }[] }).issues.map((i) => i.message).join('; ')
        : err instanceof Error
          ? err.message
          : String(err);
    process.stderr.write(`user:create: ${message}\n`);
    process.exit(1);
  });
}

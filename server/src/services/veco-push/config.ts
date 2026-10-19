import { z } from 'zod';

const Schema = z.object({
  VECO_RW_MCP_URL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.url().optional()),
  VECO_PUSH_MODE: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.enum(['fake', 'mcp', 'off']).optional()),
  NODE_ENV: z.string().trim().optional().default('development'),
});

export type VecoPushConfig =
  | { mode: 'mcp'; rwMcpUrl: string }
  | { mode: 'fake' | 'off'; rwMcpUrl: string | null };

/** The read/write MCP URL carries its key: it is read here only, and never echoed in an error. */
export function loadVecoPushConfig(env: NodeJS.ProcessEnv = process.env): VecoPushConfig {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');
    throw new Error(`Invalid VECO push configuration: ${problems}`);
  }
  const url = parsed.data.VECO_RW_MCP_URL ?? null;
  const production = parsed.data.NODE_ENV === 'production';
  const mode = parsed.data.VECO_PUSH_MODE ?? (production ? (url ? 'mcp' : 'off') : 'fake');
  if (mode === 'mcp') {
    if (!url) throw new Error('Invalid VECO push configuration: VECO_PUSH_MODE=mcp needs VECO_RW_MCP_URL');
    return { mode: 'mcp', rwMcpUrl: url };
  }
  if (mode === 'fake' && production) {
    throw new Error('Invalid VECO push configuration: VECO_PUSH_MODE=fake is not allowed in production');
  }
  return { mode, rwMcpUrl: url };
}

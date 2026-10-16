import { z } from 'zod';

const Schema = z.object({
  VECO_RW_MCP_URL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.url().optional()),
});

export interface VecoPushConfig {
  rwMcpUrl: string | null;
}

/** The read/write MCP URL carries its key: it is read here only, and never echoed in an error. */
export function loadVecoPushConfig(env: NodeJS.ProcessEnv = process.env): VecoPushConfig {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');
    throw new Error(`Invalid VECO push configuration: ${problems}`);
  }
  return { rwMcpUrl: parsed.data.VECO_RW_MCP_URL ?? null };
}

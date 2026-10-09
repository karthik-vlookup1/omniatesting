/**
 * Omnia bank accounts that agentOS "Will deposit to" text can resolve to, plus the alias table
 * (agentos_deposit_aliases). Aliases are the only thing editable here; bank_accounts is untouched.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { normaliseText } from '../../domain/agentos/match.js';

export interface DepositAccountDto {
  code: string;
  bankName: string;
  aliases: string[];
}

export async function listDepositAccounts(pool: Pool): Promise<DepositAccountDto[]> {
  const { rows } = await pool.query<{ code: string; bank_name: string; aliases: string[] }>(
    `SELECT b.code, b.bank_name,
            COALESCE((SELECT array_agg(a.alias_norm ORDER BY a.alias_norm)
                        FROM agentos_deposit_aliases a WHERE a.bank_account_code = b.code), '{}') AS aliases
       FROM bank_accounts b WHERE b.is_active ORDER BY b.code`,
  );
  return rows.map((r) => ({ code: r.code, bankName: r.bank_name, aliases: r.aliases }));
}

export async function addDepositAlias(db: ActorDb, code: string, text: string): Promise<{ code: string; alias: string }> {
  const alias = normaliseText(text);
  if (alias === '') throw new AppError('bad_request', 'Alias text is required');
  return db.tx(async (c) => {
    const { rows: acc } = await c.query<{ code: string }>(
      'SELECT code FROM bank_accounts WHERE code = $1 AND is_active',
      [code],
    );
    if (!acc[0]) throw new AppError('bad_request', `No active bank account with code ${code}`);
    const { rows: clash } = await c.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM agentos_deposit_aliases WHERE alias_norm = $1)
            + (SELECT count(*) FROM bank_accounts
                WHERE agentos_norm(code) = $1 OR agentos_norm(replace(code, '_', ' ')) = $1) AS n`,
      [alias],
    );
    if (Number(clash[0]?.n ?? 0) > 0) throw new AppError('conflict', `"${alias}" already resolves to a bank account`);
    await c.query('INSERT INTO agentos_deposit_aliases (alias_norm, bank_account_code) VALUES ($1, $2)', [alias, code]);
    return { code, alias };
  });
}

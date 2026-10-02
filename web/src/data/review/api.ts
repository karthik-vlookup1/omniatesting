import { apiRequest } from '../../lib/api';
import type { BankLine, Payer } from '../transactions';

/** Real endpoints, writers only: Omnia_recon-backend server/src/api/matching/routes.ts. */

/**
 * Exactly one of `suggestionId` or `tid`. Omitted `payer` = the suggestion's payer (or tenant for a
 * TID); omitted `amount` = the whole remaining amount. `amount` is pounds and pence as a string.
 */
export type ConfirmInput =
  | { suggestionId: string; tid?: never; payer?: Payer; remember: boolean; amount?: string }
  | { tid: string; suggestionId?: never; payer?: Payer; remember: boolean; amount?: string };

const lineUrl = (id: string) => `/matching/lines/${encodeURIComponent(id)}`;

export async function confirmLine(lineId: string, input: ConfirmInput): Promise<BankLine> {
  const body: Record<string, unknown> = { remember: input.remember };
  if (input.suggestionId) body.suggestionId = input.suggestionId;
  if (input.tid) body.tid = input.tid.trim().toUpperCase();
  if (input.payer) body.payer = input.payer;
  if (input.amount) body.amount = input.amount;
  const { line } = await apiRequest<{ line: BankLine }>(`${lineUrl(lineId)}/confirm`, { method: 'POST', body });
  return line;
}

export async function rejectSuggestion(lineId: string, suggestionId: string): Promise<BankLine> {
  const { line } = await apiRequest<{ line: BankLine }>(
    `${lineUrl(lineId)}/suggestions/${encodeURIComponent(suggestionId)}/reject`,
    { method: 'POST' },
  );
  return line;
}

export async function excludeLine(lineId: string, reason: string): Promise<BankLine> {
  const { line } = await apiRequest<{ line: BankLine }>(`${lineUrl(lineId)}/exclude`, {
    method: 'POST',
    body: { reason: reason.trim() },
  });
  return line;
}

/** Re-runs matching: the line may come back matched or needing review. */
export async function includeLine(lineId: string): Promise<BankLine> {
  const { line } = await apiRequest<{ line: BankLine }>(`${lineUrl(lineId)}/include`, { method: 'POST' });
  return line;
}

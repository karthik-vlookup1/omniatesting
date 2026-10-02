/**
 * Bank lines, as served by Omnia_recon-backend server/src/services/matching/matching.service.ts
 * (FRONTEND_REFERENCE.md §5.6). Money is a string in pounds ("325.00"; negative = money out).
 */

export type LineStatus = 'new' | 'excluded' | 'needs_review' | 'yet_to_take' | 'partially_matched' | 'matched';

/** `open` = needs_review + yet_to_take + partially_matched (the server's default). */
export type LineStatusFilter = 'open' | LineStatus;

export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export interface Suggestion {
  id: string;
  tid: string;
  tenantName: string | null;
  payer: Payer;
  method: string;
  /** 0–1 */
  confidence: number;
  reason: string | null;
  status: 'open' | 'accepted' | 'rejected';
}

export interface ReceiptView {
  id: string;
  tid: string;
  payer: Payer;
  amount: string;
  ledgerCode: string | null;
  matchedVia: string;
  /** Full name of the person who confirmed it; null = matched automatically. */
  matchedBy: string | null;
}

export interface BankLine {
  id: string;
  bankCode: string;
  importBatchId: string;
  /** YYYY-MM-DD */
  txnDate: string;
  amount: string;
  remaining: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  payerAccountLast4: string | null;
  extractedTid: string | null;
  status: LineStatus;
  exclusionReason: string | null;
  note: string | null;
  /** Best first. */
  suggestions: Suggestion[];
  receipts: ReceiptView[];
}

export interface LinesQuery {
  status: LineStatusFilter;
  bankAccountId?: string;
  batchId?: string;
  /** 1–200, server default 50. */
  limit: number;
  offset: number;
}

export interface LinesPage {
  lines: BankLine[];
  total: number;
}

export const PAGE_SIZE = 50;
export const AUTO_MATCH_THRESHOLD = 0.95;

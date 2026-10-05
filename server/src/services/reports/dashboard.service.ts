/**
 * Dashboard: imports per bank, review backlog, balances per payer type and arrears ageing.
 * Read-only aggregates; no names, no account details.
 *
 * Fixed rules:
 * - Day D: `?date=YYYY-MM-DD`. The default is today in Europe/London, from SQL
 *   `(now() AT TIME ZONE 'Europe/London')::date`. D later than today gives 400.
 *   Upload day = `(ib.uploaded_at AT TIME ZONE 'Europe/London')::date`.
 * - Rent accounts: only tenancies with `charges_from IS NOT NULL` (ended ones are included).
 *   Balance(t,payer,D) = charges with due_date<=D, plus adjustments with effective_on<=D, minus active
 *   receipts with received_on<=D. Same rule as rent.service getRentAccount and v_tenancy_balance, with
 *   dates applied. Reversed receipts never count.
 * - Imports per bank: one row per bank account that is active OR had a batch on D, ordered by code.
 *   Batches counted: source 'bank_csv', status NOT IN ('failed','rolled_back'), upload day = D.
 *   files = distinct batches; lines = their bank_transactions; incoming = lines with amount>0;
 *   autoMatched = incoming lines with a receipt where `matched_by IS NULL AND matched_via <> 'manual'`;
 *   ratePct = round(1000*auto/incoming)/10, or null when incoming = 0; lastUpload = London 'HH24:MI'.
 *   A total row adds the counts up.
 * - Review backlog is the current state, not tied to D. It counts lines with amount>0 per status:
 *   new, needs_review, partially_matched, yet_to_take. backlog = new + needs_review + partially_matched
 *   (yet_to_take is shown on its own). oldestDays = D - min(txn_date) of the backlog lines (null when
 *   there are none). Totals are also split per bank.
 * - Balances per payer type (always the 4 payer_type values): accounts = (tenancy,payer) keys with any
 *   event <= D; arrearsPence = sum of positive balances; creditPence = -(sum of negative balances);
 *   netPence = arrears - credit; plus a total row.
 * - Ageing works balance-forward, so its total equals arrears. For each key with balance B>0 the debits
 *   (charges by due_date, positive adjustments by effective_on, both <= D) are walked newest first:
 *   cum = sum(amt) OVER (PARTITION BY tenancy_id,payer ORDER BY d DESC, id DESC),
 *   aged = least(amt, greatest(0, B-(cum-amt))). Buckets by D-d: 0-30, 31-60, 61-90, 91+.
 *   Allocations are ignored, because manual pins and write-offs would make the ageing disagree
 *   with the balance.
 */
import type { Pool } from '../../db/pool.js';
import { resolveDay } from './dates.js';

type Q = Pick<Pool, 'query'>;

export const PAYERS = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'] as const;
export type PayerType = (typeof PAYERS)[number];

export interface ImportsRow {
  files: number;
  lines: number;
  incoming: number;
  autoMatched: number;
  ratePct: number | null;
  lastUpload: string | null;
}
export interface ImportsBank extends ImportsRow {
  bankAccountId: string;
  code: string;
  accountName: string;
}
export interface BacklogCounts {
  new: number;
  needsReview: number;
  partiallyMatched: number;
  yetToTake: number;
  backlog: number;
  oldestDays: number | null;
}
export interface Dashboard {
  date: string;
  imports: { banks: ImportsBank[]; total: ImportsRow };
  backlog: BacklogCounts & { banks: (BacklogCounts & { code: string })[] };
  balances: { payer: PayerType | 'total'; accounts: number; arrearsPence: number; creditPence: number; netPence: number }[];
  ageing: {
    payer: PayerType | 'total';
    d0_30: number;
    d31_60: number;
    d61_90: number;
    d91Plus: number;
    totalPence: number;
    accountsInArrears: number;
  }[];
}

const rate = (auto: number, incoming: number): number | null => (incoming === 0 ? null : Math.round((1000 * auto) / incoming) / 10);

/** Events (charges, adjustments, active receipts) for rent accounts up to $1, then one balance per key. */
const BALANCE_CTE = `
  ev AS (
    SELECT c.tenancy_id, c.payer, c.id, c.due_date AS d, c.amount AS amt, true AS is_debit
      FROM rent_charges c JOIN tenancies t ON t.id = c.tenancy_id
     WHERE t.charges_from IS NOT NULL AND c.due_date <= $1::date
    UNION ALL
    SELECT a.tenancy_id, a.payer, a.id, a.effective_on, a.amount, a.amount > 0
      FROM adjustments a JOIN tenancies t ON t.id = a.tenancy_id
     WHERE t.charges_from IS NOT NULL AND a.effective_on <= $1::date
    UNION ALL
    SELECT r.tenancy_id, r.payer, r.id, r.received_on, -r.amount, false
      FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id
     WHERE t.charges_from IS NOT NULL AND r.status = 'active' AND r.received_on <= $1::date
  ),
  bal AS (SELECT tenancy_id, payer, sum(amt) AS b FROM ev GROUP BY tenancy_id, payer)`;

const num = (v: unknown): number => Number(v ?? 0);

export async function getDashboard(q: Q, date?: string): Promise<Dashboard> {
  const day = await resolveDay(q, date);

  const [imports, backlog, balances, ageing] = await Promise.all([
    q.query<{
      id: string;
      code: string;
      account_name: string;
      files: number;
      lines: number;
      incoming: number;
      auto: number;
      last_upload: string | null;
    }>(
      `WITH b AS (
         SELECT ib.id, ib.bank_account_id, ib.uploaded_at
           FROM import_batches ib
          WHERE ib.source = 'bank_csv' AND ib.status NOT IN ('failed', 'rolled_back')
            AND (ib.uploaded_at AT TIME ZONE 'Europe/London')::date = $1::date
       ), f AS (
         SELECT bank_account_id, count(*)::int AS files,
                to_char(max(uploaded_at) AT TIME ZONE 'Europe/London', 'HH24:MI') AS last_upload
           FROM b GROUP BY bank_account_id
       ), l AS (
         SELECT b.bank_account_id, count(*)::int AS lines,
                count(*) FILTER (WHERE bt.amount > 0)::int AS incoming,
                count(*) FILTER (WHERE bt.amount > 0 AND EXISTS (
                  SELECT 1 FROM receipts r
                   WHERE r.bank_transaction_id = bt.id AND r.matched_by IS NULL AND r.matched_via <> 'manual'))::int AS auto
           FROM b JOIN bank_transactions bt ON bt.import_batch_id = b.id
          GROUP BY b.bank_account_id
       )
       SELECT ba.id, ba.code, ba.account_name, coalesce(f.files, 0) AS files, coalesce(l.lines, 0) AS lines,
              coalesce(l.incoming, 0) AS incoming, coalesce(l.auto, 0) AS auto, f.last_upload
         FROM bank_accounts ba
         LEFT JOIN f ON f.bank_account_id = ba.id
         LEFT JOIN l ON l.bank_account_id = ba.id
        WHERE ba.is_active OR f.files IS NOT NULL
        ORDER BY ba.code`,
      [day],
    ),
    q.query<{ code: string; status: string; n: number; oldest: string | null }>(
      `SELECT ba.code, bt.status::text AS status, count(*)::int AS n, to_char(min(bt.txn_date), 'YYYY-MM-DD') AS oldest
         FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE bt.amount > 0 AND bt.status IN ('new', 'needs_review', 'partially_matched', 'yet_to_take')
        GROUP BY ba.code, bt.status
        ORDER BY ba.code`,
    ),
    q.query<{ payer: PayerType; accounts: number; arrears: string; credit: string }>(
      `WITH ${BALANCE_CTE}
       SELECT p.payer::text AS payer, count(bal.b)::int AS accounts,
              (coalesce(sum(bal.b) FILTER (WHERE bal.b > 0), 0) * 100)::bigint AS arrears,
              (-coalesce(sum(bal.b) FILTER (WHERE bal.b < 0), 0) * 100)::bigint AS credit
         FROM unnest(enum_range(NULL::payer_type)) AS p(payer)
         LEFT JOIN bal ON bal.payer = p.payer
        GROUP BY p.payer`,
      [day],
    ),
    q.query<{ payer: PayerType; b0: string; b1: string; b2: string; b3: string; in_arrears: number }>(
      `WITH ${BALANCE_CTE},
       walked AS (
         SELECT ev.payer, ev.d, ev.amt, bal.b,
                sum(ev.amt) OVER (PARTITION BY ev.tenancy_id, ev.payer ORDER BY ev.d DESC, ev.id DESC) AS cum
           FROM ev JOIN bal ON bal.tenancy_id = ev.tenancy_id AND bal.payer = ev.payer
          WHERE ev.is_debit AND ev.amt > 0 AND bal.b > 0
       ), aged AS (
         SELECT payer, least(amt, greatest(0, b - (cum - amt))) AS a, ($1::date - d) AS age FROM walked
       ), sums AS (
         SELECT payer,
                coalesce(sum(a) FILTER (WHERE age <= 30), 0) AS b0,
                coalesce(sum(a) FILTER (WHERE age BETWEEN 31 AND 60), 0) AS b1,
                coalesce(sum(a) FILTER (WHERE age BETWEEN 61 AND 90), 0) AS b2,
                coalesce(sum(a) FILTER (WHERE age > 90), 0) AS b3
           FROM aged GROUP BY payer
       ), arrears AS (SELECT payer, count(*)::int AS n FROM bal WHERE b > 0 GROUP BY payer)
       SELECT p.payer::text AS payer,
              (coalesce(s.b0, 0) * 100)::bigint AS b0, (coalesce(s.b1, 0) * 100)::bigint AS b1,
              (coalesce(s.b2, 0) * 100)::bigint AS b2, (coalesce(s.b3, 0) * 100)::bigint AS b3,
              coalesce(a.n, 0) AS in_arrears
         FROM unnest(enum_range(NULL::payer_type)) AS p(payer)
         LEFT JOIN sums s ON s.payer = p.payer
         LEFT JOIN arrears a ON a.payer = p.payer`,
      [day],
    ),
  ]);

  // Imports.
  const banks: ImportsBank[] = imports.rows.map((r) => ({
    bankAccountId: r.id,
    code: r.code,
    accountName: r.account_name,
    files: r.files,
    lines: r.lines,
    incoming: r.incoming,
    autoMatched: r.auto,
    ratePct: rate(r.auto, r.incoming),
    lastUpload: r.last_upload,
  }));
  const sum = (k: 'files' | 'lines' | 'incoming' | 'autoMatched') => banks.reduce((a, b) => a + b[k], 0);
  const uploads = banks.flatMap((b) => (b.lastUpload ? [b.lastUpload] : [])).sort();
  const total: ImportsRow = {
    files: sum('files'),
    lines: sum('lines'),
    incoming: sum('incoming'),
    autoMatched: sum('autoMatched'),
    ratePct: rate(sum('autoMatched'), sum('incoming')),
    lastUpload: uploads.length > 0 ? uploads[uploads.length - 1]! : null,
  };

  // Backlog.
  const daysFrom = (oldest: string | null): number | null =>
    oldest === null ? null : Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 86_400_000);
  const counts = (rows: typeof backlog.rows): BacklogCounts => {
    const n = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.n, 0);
    const olds = rows.filter((r) => r.status !== 'yet_to_take' && r.oldest).map((r) => r.oldest!).sort();
    const c = { new: n('new'), needsReview: n('needs_review'), partiallyMatched: n('partially_matched'), yetToTake: n('yet_to_take') };
    return { ...c, backlog: c.new + c.needsReview + c.partiallyMatched, oldestDays: olds.length > 0 ? daysFrom(olds[0]!) : null };
  };
  const codes = [...new Set(backlog.rows.map((r) => r.code))].sort();

  // Balances.
  const byPayer = <T extends { payer: PayerType }>(rows: T[]) =>
    PAYERS.map((p) => rows.find((r) => r.payer === p)).filter((r): r is T => r !== undefined);
  const balRows = byPayer(balances.rows).map((r) => {
    const arrearsPence = num(r.arrears);
    const creditPence = num(r.credit);
    return { payer: r.payer, accounts: r.accounts, arrearsPence, creditPence, netPence: arrearsPence - creditPence };
  });
  const balTotal = balRows.reduce(
    (a, r) => ({
      payer: 'total' as const,
      accounts: a.accounts + r.accounts,
      arrearsPence: a.arrearsPence + r.arrearsPence,
      creditPence: a.creditPence + r.creditPence,
      netPence: a.netPence + r.netPence,
    }),
    { payer: 'total' as const, accounts: 0, arrearsPence: 0, creditPence: 0, netPence: 0 },
  );

  // Ageing.
  const ageRows = byPayer(ageing.rows).map((r) => {
    const d0_30 = num(r.b0);
    const d31_60 = num(r.b1);
    const d61_90 = num(r.b2);
    const d91Plus = num(r.b3);
    return { payer: r.payer, d0_30, d31_60, d61_90, d91Plus, totalPence: d0_30 + d31_60 + d61_90 + d91Plus, accountsInArrears: r.in_arrears };
  });
  const ageTotal = ageRows.reduce(
    (a, r) => ({
      payer: 'total' as const,
      d0_30: a.d0_30 + r.d0_30,
      d31_60: a.d31_60 + r.d31_60,
      d61_90: a.d61_90 + r.d61_90,
      d91Plus: a.d91Plus + r.d91Plus,
      totalPence: a.totalPence + r.totalPence,
      accountsInArrears: a.accountsInArrears + r.accountsInArrears,
    }),
    { payer: 'total' as const, d0_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0, totalPence: 0, accountsInArrears: 0 },
  );

  return {
    date: day,
    imports: { banks, total },
    backlog: { ...counts(backlog.rows), banks: codes.map((code) => ({ code, ...counts(backlog.rows.filter((r) => r.code === code)) })) },
    balances: [...balRows, balTotal],
    ageing: [...ageRows, ageTotal],
  };
}

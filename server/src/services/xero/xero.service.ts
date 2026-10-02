/**
 * Xero posting, the accounts procedure's "Rental Income sheet → Xero" step: ONE sales invoice per bank
 * account per bank date, one line per confirmed receipt. Invoices are staged as batches in sync_outbox
 * (entity_type 'invoice', idempotency key = the bridge externalRef), and each receipt is claimed for
 * exactly one batch through external_refs (UNIQUE system/entity_type/entity_id). A worker pushes ready
 * batches through the bridge with retries; the bridge's externalRef dedupe makes a retry safe.
 */
import { randomUUID } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { BridgeInvoice, BridgeLineItem, XeroBridge } from './bridge.js';

export const MAX_ATTEMPTS = 5;
/** An in-flight batch whose worker died is retried after this lease (the bridge dedupes). */
const LEASE_MINUTES = 10;
const STAGE_LOCK = 0x7e60c1;

export interface XeroSettings {
  /** Xero contact name per bank code, e.g. { HSBC: "Apollo HSBC" }; default = the bank account name. */
  contacts: Record<string, string>;
  /**
   * Also send invoiceNumber, reference "Rental Income", itemCode = TID and tracking (Properties, Branch),
   * as the accounts team's invoices have them. Off until the bridge is confirmed to accept these fields.
   */
  extendedFields: boolean;
}

export interface InvoiceLine {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  accountCode: string;
  managementType: string;
  /** Tracking "Branch": office code for RG, "Managed" for MG, "IRG" for IRG. */
  branch: string | null;
  /** Tracking "Properties": the building's Xero option name, when the property map has it. */
  property: string | null;
}

export interface InvoiceDraft {
  bankCode: string | null;
  contactName: string;
  date: string;
  invoiceNumber: string;
  lines: InvoiceLine[];
  total: string;
}

export interface Batch extends InvoiceDraft {
  batchId: string;
}

export type OutboxStatus = 'pending' | 'in_flight' | 'done' | 'failed' | 'dead';

export interface OutboxItem extends Batch {
  id: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  xeroInvoiceId: string | null;
  xeroInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------------------------- settings

/** Anything with pg's query(): a pool, a client, or a request's ActorDb. */
type Queryable = Pick<Pool, 'query'> | PoolClient;

export async function getXeroSettings(pool: Queryable): Promise<XeroSettings> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    "SELECT key, value FROM integration_settings WHERE system = 'xero' AND key IN ('contacts', 'extended_fields')",
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  let contacts: Record<string, string>;
  try {
    contacts = JSON.parse(get('contacts') ?? '{}') as Record<string, string>;
  } catch {
    contacts = {};
  }
  return { contacts, extendedFields: get('extended_fields') === 'true' };
}

export async function saveXeroSettings(db: ActorDb, s: XeroSettings): Promise<XeroSettings> {
  const contacts = Object.fromEntries(
    Object.entries(s.contacts)
      .map(([k, v]) => [k.trim().toUpperCase(), v.trim()] as const)
      .filter(([k, v]) => k !== '' && v !== ''),
  );
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO integration_settings (system, key, value) VALUES ('xero', 'contacts', $1), ('xero', 'extended_fields', $2)
       ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(contacts), String(s.extendedFields)],
    );
  });
  return { contacts, extendedFields: s.extendedFields };
}

// ------------------------------------------------------------------------------------------ pending work

/** Sum pound strings exactly, in pence. */
export function sumPounds(amounts: string[]): string {
  let pence = 0n;
  for (const a of amounts) {
    const neg = a.startsWith('-');
    const [whole = '0', frac = ''] = a.replace('-', '').split('.');
    const p = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
    pence += neg ? -p : p;
  }
  const neg = pence < 0n;
  const abs = neg ? -pence : pence;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** "Apollo HSBC" + 2026-10-01 → "Apollo HSBC 011026", as the accounts team number them. */
export function invoiceNumberFor(contactName: string, date: string): string {
  const [y, m, d] = date.split('-');
  return `${contactName} ${d}${m}${y!.slice(2)}`;
}

export const branchTracking = (managementType: string, branchCode: string | null): string | null =>
  managementType === 'MG' ? 'Managed' : managementType === 'IRG' ? 'IRG' : branchCode;

const PENDING_SQL = `
SELECT r.id AS receipt_id, r.amount::text AS amount,
       to_char(coalesce(bt.txn_date, r.received_on), 'YYYY-MM-DD') AS date,
       b.code AS bank_code, b.account_name, t.tid, t.management_type::text AS management_type,
       tn.full_name AS tenant_name, br.code AS branch_code, xp.external_key2 AS property_option,
       coalesce(r.ledger_code,
                (SELECT l.ledger_code FROM xero_ledger_rules l
                  WHERE l.category = 'regular' AND l.management_type = t.management_type)) AS account_code
  FROM receipts r
  JOIN tenancies t ON t.id = r.tenancy_id
  LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
  LEFT JOIN bank_accounts b ON b.id = bt.bank_account_id
  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn ON tn.id = tt.tenant_id
  LEFT JOIN properties p ON p.id = t.property_id
  LEFT JOIN branches br ON br.id = p.branch_id
  LEFT JOIN external_refs xp ON xp.system = 'xero' AND xp.entity_type = 'property' AND xp.entity_id = p.id
 WHERE r.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM external_refs e
                    WHERE e.system = 'xero' AND e.entity_type = 'receipt' AND e.entity_id = r.id)
 ORDER BY b.code NULLS LAST, 3, t.tid, r.id`;

interface PendingRow {
  receipt_id: string;
  amount: string;
  date: string;
  bank_code: string | null;
  account_name: string | null;
  tid: string;
  management_type: string;
  tenant_name: string | null;
  branch_code: string | null;
  property_option: string | null;
  account_code: string | null;
}

/** Confirmed receipts not yet in Xero, grouped into the invoices they would become. */
export async function draftInvoices(pool: Pool | PoolClient): Promise<InvoiceDraft[]> {
  const settings = await getXeroSettings(pool);
  const { rows } = await pool.query<PendingRow>(PENDING_SQL);
  const groups = new Map<string, InvoiceDraft>();
  for (const r of rows) {
    const key = `${r.bank_code ?? ''}|${r.date}`;
    let g = groups.get(key);
    if (!g) {
      const contactName = (r.bank_code && settings.contacts[r.bank_code]) || r.account_name || 'Manual receipts';
      g = {
        bankCode: r.bank_code,
        contactName,
        date: r.date,
        invoiceNumber: invoiceNumberFor(contactName, r.date),
        lines: [],
        total: '0.00',
      };
      groups.set(key, g);
    }
    g.lines.push({
      receiptId: r.receipt_id,
      tid: r.tid,
      tenantName: r.tenant_name,
      amount: r.amount,
      accountCode: r.account_code ?? '001',
      managementType: r.management_type,
      branch: branchTracking(r.management_type, r.branch_code),
      property: r.property_option,
    });
  }
  for (const g of groups.values()) g.total = sumPounds(g.lines.map((l) => l.amount));
  return [...groups.values()];
}

/**
 * Turns every pending receipt into staged invoice batches. A bank-day already invoiced gets a numbered
 * follow-up ("Apollo HSBC 011026 (2)") for receipts confirmed later.
 */
export async function stageInvoices(db: ActorDb): Promise<Batch[]> {
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [STAGE_LOCK]);
    const drafts = await draftInvoices(c);
    const batches: Batch[] = [];
    for (const d of drafts) {
      const { rows } = await c.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM sync_outbox WHERE system = 'xero' AND entity_type = 'invoice' AND payload->>'baseNumber' = $1",
        [d.invoiceNumber],
      );
      const n = rows[0]!.n;
      const batch: Batch = {
        ...d,
        batchId: randomUUID(),
        invoiceNumber: n === 0 ? d.invoiceNumber : `${d.invoiceNumber} (${n + 1})`,
      };
      await c.query(
        `INSERT INTO sync_outbox (system, entity_type, entity_id, op, payload, idempotency_key)
         VALUES ('xero', 'invoice', $1, 'upsert', $2, $3)`,
        [batch.batchId, JSON.stringify({ ...batch, baseNumber: d.invoiceNumber }), externalRefFor(batch.batchId)],
      );
      await c.query(
        `INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at)
         SELECT 'xero', 'receipt', id, $1 || ':' || id, $1, now() FROM unnest($2::uuid[]) AS id`,
        [batch.batchId, batch.lines.map((l) => l.receiptId)],
      );
      batches.push(batch);
    }
    return batches;
  });
}

export const externalRefFor = (batchId: string) => `recon-inv:${batchId}`;

// ------------------------------------------------------------------------------------------------- push

export function toBridgeInvoice(batch: Batch, contactId: string, extended: boolean): BridgeInvoice {
  const lineItems: BridgeLineItem[] = batch.lines.map((l) => {
    const name = l.tenantName ?? '';
    const base: BridgeLineItem = {
      // Without item codes the TID must stay visible in the description.
      description: extended ? name || l.tid : `${l.tid} ${name}`.trim(),
      quantity: 1,
      unitAmount: Number(l.amount),
      accountCode: l.accountCode,
      taxType: 'NONE',
    };
    if (!extended) return base;
    const tracking = [
      ...(l.property ? [{ name: 'Properties', option: l.property }] : []),
      ...(l.branch ? [{ name: 'Branch', option: l.branch }] : []),
    ];
    return {
      ...base,
      itemCode: l.tid,
      ...(tracking.length ? { tracking } : {}),
    };
  });
  return {
    externalRef: externalRefFor(batch.batchId),
    contactId,
    date: batch.date,
    dueDate: batch.date,
    status: 'AUTHORISED',
    lineItems,
    ...(extended ? { invoiceNumber: batch.invoiceNumber, reference: 'Rental Income' } : {}),
  };
}

export interface RunResult {
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
  results: {
    batchId: string;
    invoiceNumber: string;
    ok: boolean;
    xeroInvoiceId?: string;
    deduped?: boolean;
    error?: string;
  }[];
}

/** Claims ready batches (pending, failed past their backoff, or in flight past the lease) and pushes them. */
/**
 * A batch left in flight on its last attempt (the worker died) can't be claimed again: mark it dead,
 * once its lease has run out, so it shows under "gave up" and a person can retry it.
 */
export async function markAbandoned(q: Pick<Pool, 'query'>): Promise<number> {
  const { rowCount } = await q.query(
    `UPDATE sync_outbox SET status = 'dead',
            last_error = 'Stopped during the last attempt. Check Xero for this invoice before retrying.'
      WHERE system = 'xero' AND entity_type = 'invoice' AND status = 'in_flight'
        AND attempts >= $1 AND next_attempt_at <= now()`,
    [MAX_ATTEMPTS],
  );
  return rowCount ?? 0;
}

/**
 * Re-reads a batch's receipts just before sending: lines whose receipt was reversed since staging are
 * dropped (their claim released) and the total redone. Returns null when nothing is left to send.
 */
async function currentBatch(c: PoolClient, outboxId: string, batch: Batch): Promise<Batch | null> {
  const { rows } = await c.query<{ id: string }>(
    "SELECT id FROM receipts WHERE id = ANY($1::uuid[]) AND status = 'active'",
    [batch.lines.map((l) => l.receiptId)],
  );
  const active = new Set(rows.map((r) => r.id));
  if (active.size === batch.lines.length) return batch;
  const gone = batch.lines.filter((l) => !active.has(l.receiptId)).map((l) => l.receiptId);
  await c.query(
    "DELETE FROM external_refs WHERE system = 'xero' AND entity_type = 'receipt' AND entity_id = ANY($1::uuid[])",
    [gone],
  );
  const lines = batch.lines.filter((l) => active.has(l.receiptId));
  const next: Batch = { ...batch, lines, total: sumPounds(lines.map((l) => l.amount)) };
  await c.query('UPDATE sync_outbox SET payload = payload || $2::jsonb WHERE id = $1', [
    outboxId,
    JSON.stringify({ lines: next.lines, total: next.total }),
  ]);
  return lines.length > 0 ? next : null;
}

export async function runOutbox(
  db: ActorDb,
  bridge: XeroBridge,
  { limit = 20 }: { limit?: number } = {},
): Promise<RunResult> {
  await markAbandoned(db);
  const claimed = await db.tx(async (c) => {
    const { rows } = await c.query<{
      id: string;
      payload: Batch;
      attempts: number;
    }>(
      `UPDATE sync_outbox o SET status = 'in_flight', attempts = o.attempts + 1,
              next_attempt_at = now() + make_interval(mins => $2)
        WHERE o.id IN (SELECT id FROM sync_outbox
                        WHERE system = 'xero' AND entity_type = 'invoice'
                          AND status IN ('pending', 'failed', 'in_flight') AND next_attempt_at <= now()
                          AND attempts < $3
                        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING o.id::text AS id, o.payload, o.attempts`,
      [limit, LEASE_MINUTES, MAX_ATTEMPTS],
    );
    return rows;
  });

  const settings = await getXeroSettings(db);
  const result: RunResult = {
    attempted: claimed.length,
    sent: 0,
    failed: 0,
    dead: 0,
    results: [],
  };
  for (const item of claimed.sort((a, b) => Number(a.id) - Number(b.id))) {
    const batch = await db.tx((c) => currentBatch(c, item.id, item.payload));
    if (!batch) {
      await db.query(
        `UPDATE sync_outbox SET status = 'dead', last_error = 'Every receipt on this invoice was reversed before sending'
          WHERE id = $1 AND status = 'in_flight' AND attempts = $2`,
        [item.id, item.attempts],
      );
      result.dead += 1;
      result.results.push({
        batchId: item.payload.batchId,
        invoiceNumber: item.payload.invoiceNumber,
        ok: false,
        error: 'every receipt was reversed before sending',
      });
      continue;
    }
    try {
      const { contactId } = await bridge.upsertContact(batch.contactName);
      const inv = await bridge.createInvoice(toBridgeInvoice(batch, contactId, settings.extendedFields));
      await db.tx(async (c) => {
        // Done wins over any state a slower, overlapping run might have written.
        await c.query("UPDATE sync_outbox SET status = 'done', done_at = now(), last_error = NULL WHERE id = $1", [
          item.id,
        ]);
        await c.query(
          `INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at)
           VALUES ('xero', 'invoice', $1, $2, $3, now())
           ON CONFLICT (system, entity_type, entity_id)
           DO UPDATE SET external_id = EXCLUDED.external_id, external_key2 = EXCLUDED.external_key2, last_synced_at = now()`,
          [batch.batchId, inv.invoiceId, inv.invoiceNumber],
        );
      });
      result.sent += 1;
      result.results.push({
        batchId: batch.batchId,
        invoiceNumber: batch.invoiceNumber,
        ok: true,
        xeroInvoiceId: inv.invoiceId,
        deduped: inv.deduped,
      });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const dead = item.attempts >= MAX_ATTEMPTS;
      await db.tx(async (c) => {
        await c.query(
          // Only if this run still owns the claim: never overwrite 'done' from an overlapping run.
          `UPDATE sync_outbox SET status = $2, last_error = $3,
                  next_attempt_at = now() + make_interval(mins => $4)
            WHERE id = $1 AND status = 'in_flight' AND attempts = $5`,
          [item.id, dead ? 'dead' : 'failed', message, 2 ** item.attempts, item.attempts],
        );
      });
      if (dead) result.dead += 1;
      else result.failed += 1;
      result.results.push({
        batchId: batch.batchId,
        invoiceNumber: batch.invoiceNumber,
        ok: false,
        error: message,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------- outbox

const OUTBOX_SELECT = `
SELECT o.id::text AS id, o.payload, o.status::text AS status, o.attempts, o.last_error,
       o.created_at, coalesce(o.done_at, o.next_attempt_at, o.created_at) AS updated_at,
       x.external_id AS xero_invoice_id, x.external_key2 AS xero_invoice_number
  FROM sync_outbox o
  LEFT JOIN external_refs x ON x.system = 'xero' AND x.entity_type = 'invoice' AND x.entity_id = o.entity_id
 WHERE o.system = 'xero' AND o.entity_type = 'invoice'`;

interface OutboxRow {
  id: string;
  payload: Batch;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  xero_invoice_id: string | null;
  xero_invoice_number: string | null;
}

const toItem = (r: OutboxRow): OutboxItem => ({
  ...r.payload,
  id: r.id,
  status: r.status,
  attempts: r.attempts,
  lastError: r.last_error,
  xeroInvoiceId: r.xero_invoice_id,
  xeroInvoiceNumber: r.xero_invoice_number,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function listOutbox(
  pool: Pool,
  status?: 'open' | OutboxStatus,
): Promise<{ items: OutboxItem[]; summary: Record<OutboxStatus, number>; ready: number }> {
  await markAbandoned(pool);
  const filter =
    status === undefined
      ? ''
      : status === 'open'
        ? " AND o.status IN ('pending', 'in_flight', 'failed')"
        : ' AND o.status = $1';
  const { rows } = await pool.query<OutboxRow>(
    `${OUTBOX_SELECT}${filter} ORDER BY o.id DESC LIMIT 200`,
    status && status !== 'open' ? [status] : [],
  );
  const { rows: counts } = await pool.query<{
    status: OutboxStatus;
    n: number;
  }>(
    "SELECT status::text AS status, count(*)::int AS n FROM sync_outbox WHERE system = 'xero' AND entity_type = 'invoice' GROUP BY status",
  );
  const summary = {
    pending: 0,
    in_flight: 0,
    done: 0,
    failed: 0,
    dead: 0,
  } as Record<OutboxStatus, number>;
  for (const c of counts) summary[c.status] = c.n;
  return { items: rows.map(toItem), summary, ready: await readyCount(pool) };
}

/** Sends a failed or dead batch round again, from attempt zero. */
export async function retryBatch(db: ActorDb, id: string): Promise<OutboxItem> {
  return db.tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE sync_outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
        WHERE id = $1 AND system = 'xero' AND entity_type = 'invoice' AND status IN ('failed', 'dead')`,
      [id],
    );
    const { rows } = await c.query<OutboxRow>(`${OUTBOX_SELECT} AND o.id = $1`, [id]);
    if (!rows[0]) throw new AppError('not_found', 'No such Xero batch');
    if (rowCount === 0)
      throw new AppError('conflict', `Only failed batches can be retried (this one is ${rows[0].status})`);
    return toItem(rows[0]);
  });
}

/** How many batches the worker would push now. */
export async function readyCount(pool: Pool): Promise<number> {
  await markAbandoned(pool);
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sync_outbox
      WHERE system = 'xero' AND entity_type = 'invoice' AND status IN ('pending', 'failed', 'in_flight')
        AND next_attempt_at <= now() AND attempts < $1`,
    [MAX_ATTEMPTS],
  );
  return rows[0]!.n;
}

/**
 * Where a receipt stands in the outside systems.
 *
 * Xero: the receipt is claimed for a batch through external_refs(system 'xero', entity_type 'receipt',
 * external_key2 = batch id); that batch's outbox row has idempotency_key 'recon-inv:' || batch id
 * (see stageInvoices in the Xero service). Its status gives:
 *   none (no claim) | queued (pending / failed) | sending (in_flight) | stuck (dead) | sent (done)
 * Vico: an external_refs row (system 'vico', entity_type 'receipt') means the receipt was exported.
 */
import type { Pool, PoolClient } from '../../db/pool.js';

export type XeroState = 'none' | 'queued' | 'sending' | 'stuck' | 'sent';

export interface ExternalState {
  xeroState: XeroState;
  vicoExported: boolean;
}

const OUTBOX_TO_STATE: Record<string, XeroState> = {
  pending: 'queued',
  failed: 'queued',
  in_flight: 'sending',
  dead: 'stuck',
  done: 'sent',
};

export async function externalState(c: Pool | PoolClient, receiptIds: string[]): Promise<Map<string, ExternalState>> {
  const out = new Map<string, ExternalState>();
  for (const id of receiptIds) out.set(id, { xeroState: 'none', vicoExported: false });
  if (receiptIds.length === 0) return out;
  const { rows } = await c.query<{ id: string; xero: string | null; has_claim: boolean; vico: boolean }>(
    `SELECT r.id,
            ob.status::text AS xero,
            (xr.id IS NOT NULL) AS has_claim,
            EXISTS (SELECT 1 FROM external_refs v
                     WHERE v.system = 'vico' AND v.entity_type = 'receipt' AND v.entity_id = r.id) AS vico
       FROM receipts r
       LEFT JOIN external_refs xr ON xr.system = 'xero' AND xr.entity_type = 'receipt' AND xr.entity_id = r.id
       LEFT JOIN sync_outbox ob ON ob.system = 'xero' AND ob.idempotency_key = 'recon-inv:' || xr.external_key2
      WHERE r.id = ANY($1::uuid[])`,
    [receiptIds],
  );
  for (const r of rows) {
    // A claim whose outbox row is missing is treated as queued: it is still tied to a batch.
    const xeroState: XeroState = !r.has_claim ? 'none' : (OUTBOX_TO_STATE[r.xero ?? ''] ?? 'queued');
    out.set(r.id, { xeroState, vicoExported: r.vico });
  }
  return out;
}

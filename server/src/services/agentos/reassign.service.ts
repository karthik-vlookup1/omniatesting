/**
 * Reassign an intake line to another agentOS TID and re-run the match rules (recon-505).
 * The UPDATE goes through the actor's db, so the audit trigger records who changed what.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { decideMatch, type MatchCandidate } from '../../domain/agentos/match.js';
import { paymentFrom } from './export.service.js';
import type { IntakeLineDto } from './intake.service.js';

export interface ReassignTenantDto {
  id: string;
  tid: string;
  name: string;
  depositTo: string;
}

export interface ReassignResult {
  line: IntakeLineDto;
  previous: { tid: string | null; matchStatus: string; agentosTenantId: string | null };
}

export async function listReassignTenants(pool: Pool): Promise<ReassignTenantDto[]> {
  // Reassign targets a TID, so api rows without one (flagged no_tid) are not offered.
  const { rows } = await pool.query<{ id: string; tid: string | null; forename: string; surname: string; deposit_to: string }>(
    'SELECT id, tid, forename, surname, deposit_to FROM agentos_tenants WHERE tid IS NOT NULL ORDER BY tid, agentos_ref',
  );
  return rows.flatMap((r) =>
    r.tid === null
      ? []
      : [{ id: r.id, tid: r.tid, name: paymentFrom(r.tid, r.forename, r.surname), depositTo: r.deposit_to }],
  );
}

export async function reassignLineTid(db: ActorDb, rawInput: { lineId: string; tid: string }): Promise<ReassignResult> {
  const input = { ...rawInput, tid: rawInput.tid.trim().replace(/^[Tt]/, '') };
  return db.tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('agentos-export'))");
    const { rows } = await c.query<{
      tid_raw: string | null;
      payer_name: string;
      deposit_to: string;
      match_status: string;
      agentos_tenant_id: string | null;
      posting_status: string;
    }>(
      `SELECT tid_raw, payer_name, deposit_to, match_status, agentos_tenant_id, posting_status
         FROM agentos_intake_lines WHERE id = $1 FOR UPDATE`,
      [input.lineId],
    );
    const cur = rows[0];
    if (!cur) throw new AppError('not_found', 'No such intake line');
    if (cur.posting_status === 'exported' || cur.posting_status === 'posted') {
      throw new AppError('conflict', 'Exported or posted lines cannot be reassigned');
    }

    const { rows: tenants } = await c.query<{
      id: string; tid: string | null; forename: string; surname: string; deposit_to: string; agentos_ref: string | null;
    }>(
      `SELECT id, tid, forename, surname, deposit_to, agentos_ref FROM agentos_tenants
        WHERE tid IS NOT NULL AND tid = $1 ORDER BY agentos_ref`,
      [input.tid],
    );
    if (tenants.length === 0) throw new AppError('bad_request', `No agentOS tenant has TID ${input.tid}`);
    const candidates: MatchCandidate[] = tenants.flatMap((r) =>
      r.tid === null
        ? []
        : [{ id: r.id, tid: r.tid, forename: r.forename, surname: r.surname, depositTo: r.deposit_to, agentosRef: r.agentos_ref ?? '' }],
    );
    const d = decideMatch({ tid: input.tid, payerName: cur.payer_name, depositTo: cur.deposit_to }, candidates);

    const { rows: out } = await c.query<{
      id: string; line_no: number; received_on: string; tid_raw: string | null; payer_name: string;
      amount_pence: number; payment_type: string; deposit_to: string; description: string;
      warnings: string[]; match_status: string; agentos_tenant_id: string | null; posting_status: string;
    }>(
      `UPDATE agentos_intake_lines
          SET tid_raw = $2, match_status = $3, agentos_tenant_id = $4, updated_at = now()
        WHERE id = $1
        RETURNING id, line_no, to_char(received_on, 'YYYY-MM-DD') AS received_on, tid_raw, payer_name, amount_pence,
                  payment_type, deposit_to, description, warnings, match_status, agentos_tenant_id, posting_status`,
      [input.lineId, input.tid, d.status, d.tenantId],
    );
    const l = out[0]!;
    return {
      line: {
        id: l.id,
        lineNo: l.line_no,
        receivedOn: l.received_on,
        tid: l.tid_raw,
        payerName: l.payer_name,
        amountPence: l.amount_pence,
        paymentType: l.payment_type,
        depositTo: l.deposit_to,
        description: l.description,
        warnings: l.warnings,
        matchStatus: l.match_status,
        agentosTenantId: l.agentos_tenant_id,
        postingStatus: l.posting_status,
      },
      previous: { tid: cur.tid_raw, matchStatus: cur.match_status, agentosTenantId: cur.agentos_tenant_id },
    };
  });
}

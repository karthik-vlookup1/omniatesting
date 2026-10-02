/**
 * Xero "Properties" tracking options per building, from the Veco warehouse table dim_PropertyXeroMap.
 * Stored in external_refs (system 'xero', entity_type 'property'): external_id = the tracking option id,
 * external_key2 = its name ("0866 55 Sudbury Croft, Sudbury HA0 2QW *HL"), used on invoice lines.
 */
import type { ActorDb } from '../../db/context.js';
import { VecoSourceError, type SqlSource } from '../../jobs/veco-sync/mcp-client.js';

export const PROPERTY_MAP_SQL = `
SELECT m.portfolio_ref AS portfolioRef,
       CAST(m.xero_tracking_option_id AS varchar(36)) AS optionId,
       m.xero_option_name AS optionName,
       m.name_suffix AS suffix
  FROM dim_PropertyXeroMap m
 WHERE m.match_status = 'matched_active' AND m.portfolio_ref IS NOT NULL AND m.xero_tracking_option_id IS NOT NULL`;

export interface PropertyMapSummary {
  fetched: number;
  matched: number;
  /** Buildings of ours with no Xero option: their invoice lines go without the Properties tracking. */
  unmatchedProperties: number;
  /** Veco refs with more than one option; the one with a suffix (then by name) was used. */
  ambiguous: number;
}

interface MapRow {
  portfolioRef: string;
  optionId: string;
  optionName: string;
  suffix: string | null;
}

export async function refreshPropertyMap(db: ActorDb, source: SqlSource): Promise<PropertyMapSummary> {
  const raw = (await source.queryRows(PROPERTY_MAP_SQL)) as unknown as MapRow[];
  const rows = raw.filter(
    (r) => typeof r.portfolioRef === 'string' && typeof r.optionId === 'string' && typeof r.optionName === 'string',
  );
  // One option per building: prefer one with a suffix, then the first by name.
  const byRef = new Map<string, MapRow[]>();
  for (const r of rows) {
    const key = r.portfolioRef.trim().toUpperCase();
    byRef.set(key, [...(byRef.get(key) ?? []), r]);
  }
  const chosen = [...byRef.entries()].map(([ref, options]) => {
    options.sort((a, b) => Number(!a.suffix) - Number(!b.suffix) || a.optionName.localeCompare(b.optionName));
    return {
      ref,
      optionId: options[0]!.optionId.toLowerCase(),
      optionName: options[0]!.optionName.trim(),
    };
  });

  if (chosen.length === 0) {
    // An empty answer is far more likely a Veco problem than Xero losing every property: keep what we have.
    throw new VecoSourceError('Veco returned no Xero property options; the current list was kept');
  }

  return db.tx(async (c) => {
    // Replace the whole set: options move between buildings and buildings drop out of matched_active,
    // and external_refs is unique on both the building and the option id.
    await c.query("DELETE FROM external_refs WHERE system = 'xero' AND entity_type = 'property'");
    const { rowCount } = await c.query(
      `WITH m AS (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS m(ref, option_id, option_name))
       INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at)
       SELECT DISTINCT ON (m.option_id) 'xero', 'property', p.id, m.option_id, m.option_name, now()
         FROM m JOIN properties p ON upper(p.property_ref) = m.ref
        ORDER BY m.option_id, p.property_ref
       ON CONFLICT DO NOTHING`,
      [chosen.map((x) => x.ref), chosen.map((x) => x.optionId), chosen.map((x) => x.optionName)],
    );
    const { rows: un } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM properties p
        WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM external_refs e
                                           WHERE e.system = 'xero' AND e.entity_type = 'property' AND e.entity_id = p.id)`,
    );
    return {
      fetched: rows.length,
      matched: rowCount ?? 0,
      unmatchedProperties: un[0]!.n,
      ambiguous: [...byRef.values()].filter((o) => o.length > 1).length,
    };
  });
}

-- =============================================================================
-- OMNIA RECON — Migration 004: expected payment falls back to the tenancy's rent
-- -----------------------------------------------------------------------------
-- Rent charges (recon-103) and payment methods (recon-104) are deferred, and
-- tenancies + their rent now arrive from Veco as rent_schedules. Without either
-- source, expected_payment() returned NULL, which silently disabled two
-- matching steps that compare the amount with what is expected:
--   3b  payer account shared by several tenancies (0.70 when the amount agrees)
--   5   fuzzy tenant name + amount within 5%
--
-- New order (first non-NULL wins):
--   1. payment_methods.expected_amount       (unchanged)
--   2. rent_charges for the period           (unchanged)
--   3. the rent schedule in force that day   (NEW) — only when the tenancy has
--      no payer_splits, i.e. nobody shares the rent, so whoever pays is
--      expected to pay the full amount for one period.
-- Behaviour is identical whenever 1 or 2 exist, so the 002 scenarios still hold.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION expected_payment(p_tenancy uuid, p_payer payer_type, p_on date) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT expected_amount FROM payment_methods
          WHERE tenancy_id = p_tenancy AND payer = p_payer AND expected_amount IS NOT NULL
            AND effective_from <= p_on AND (effective_to IS NULL OR effective_to >= p_on)
          ORDER BY is_primary DESC, effective_from DESC LIMIT 1),
        (SELECT amount FROM rent_charges
          WHERE tenancy_id = p_tenancy AND payer = p_payer
            AND p_on BETWEEN period_start AND period_end
          ORDER BY period_start DESC LIMIT 1),
        (SELECT rs.amount FROM rent_schedules rs
          WHERE rs.tenancy_id = p_tenancy
            AND rs.effective_from <= p_on AND (rs.effective_to IS NULL OR rs.effective_to >= p_on)
            AND NOT EXISTS (SELECT 1 FROM payer_splits ps WHERE ps.tenancy_id = p_tenancy)
          ORDER BY rs.effective_from DESC LIMIT 1))
$$;

COMMENT ON FUNCTION expected_payment(uuid, payer_type, date) IS
  'What this payer should pay for this tenancy around a date: payment method, else the charge for the period, '
  'else (no payer splits) the rent schedule in force. NULL = unknown. Migration 004 added the rent fallback.';

COMMIT;

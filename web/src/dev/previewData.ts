/**
 * DEV-ONLY synthetic sample data for preview mode. Nothing here is real: invented names, TIDs,
 * addresses and masked NI / account endings. Shapes mirror FRONTEND_REFERENCE.md §5.
 */
import type { BankAccount, ImportBatch } from '../data/imports/types';
import type { TenancyDetail } from '../data/tenancies/types';
import type { BankLine, Suggestion } from '../data/transactions/types';

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const profile = (version: number) => ({
  id: uuid('9a000000', version),
  version,
  headerAliases: { txn_date: ['Date'], description: ['Description'], amount: ['Amount'] },
  requiredFields: ['txn_date' as const, 'description' as const, 'amount' as const],
  amountMode: 'signed' as const,
  dateFormat: 'DD/MM/YYYY',
  skipRows: 0,
  notes: null,
});

export const BANKS: BankAccount[] = [
  { id: uuid('b1000000', 1), code: 'HSBC', bankName: 'HSBC', accountName: 'Rent receipts', isActive: true, profile: profile(3) },
  { id: uuid('b1000000', 2), code: 'LLOYDS', bankName: 'Lloyds', accountName: 'Rent receipts', isActive: true, profile: profile(2) },
  { id: uuid('b1000000', 3), code: 'ISL', bankName: 'ISL', accountName: 'Collections', isActive: true, profile: null },
];

export const TENANCIES: TenancyDetail[] = [
  ['T1001', 'Jordan Smith', 'MG', '12C', '1 Example Street', 'B1 1AA', 'BHM', '650.00', 'monthly', 'active'],
  ['T1002', 'Ava Brown', 'RG', '34D', '2 Sample Road', 'B2 2BB', 'BHM', '120.00', 'weekly', 'active'],
  ['T1003', 'Casey Jones', 'IRG', '56A', 'Flat 3, 9 Demo Court', 'M1 3CC', 'MAN', '540.00', 'four_weekly', 'active'],
  ['T1004', 'Riley Patel', 'RG', '78B', '14 Placeholder Lane', 'M2 4DD', 'MAN', '700.00', 'monthly', 'active'],
  ['T1005', 'Morgan Lee', 'MG', null, '5 Fixture Close', 'LS1 5EE', 'LDS', '480.00', 'monthly', 'active'],
  ['T1006', 'Sam Okafor', 'RG', '90C', '7 Mock Avenue', 'LS2 6FF', 'LDS', '95.00', 'weekly', 'ended'],
  ['T1007', 'Jamie Clarke', 'IRG', '11A', 'Room 2, 30 Trial Street', 'B3 7GG', 'BHM', '420.00', 'monthly', 'active'],
  ['T1008', 'Alex Novak', 'MG', '22B', '41 Specimen Row', 'M3 8HH', 'MAN', '610.00', 'monthly', 'pending'],
].map(([tid, name, mt, ni, address, postcode, branch, rent, freq, status], i) => ({
  tid: tid as string,
  status: status as TenancyDetail['status'],
  startDate: `2025-0${(i % 8) + 1}-01`,
  endDate: status === 'ended' ? '2026-06-30' : null,
  managementType: mt as TenancyDetail['managementType'],
  tenantName: name as string,
  niMasked: ni ? `•••••${ni as string}` : null,
  propertyRef: `P-${String(100 + i)}`,
  unitRef: null,
  postcode: postcode as string,
  address: address as string,
  branchCode: branch as string,
  rent: { amount: rent as string, frequency: freq as string },
}));

export const IMPORTS: ImportBatch[] = [
  { id: uuid('c1000000', 1), bankCode: 'HSBC', fileName: 'hsbc-statement-sep-2026.csv', periodFrom: '2026-09-01', periodTo: '2026-09-30', rowsTotal: 9, rowsInserted: 9, rowsDuplicate: 0, uploadedAt: '2026-10-01T08:42:00Z', uploadedBy: 'Sam Taylor' },
  { id: uuid('c1000000', 2), bankCode: 'LLOYDS', fileName: 'lloyds-sep-2026.csv', periodFrom: '2026-09-01', periodTo: '2026-09-30', rowsTotal: 7, rowsInserted: 6, rowsDuplicate: 1, uploadedAt: '2026-10-01T09:05:00Z', uploadedBy: 'Priya Shah' },
  { id: uuid('c1000000', 3), bankCode: 'HSBC', fileName: 'hsbc-statement-aug-2026.csv', periodFrom: '2026-08-01', periodTo: '2026-08-31', rowsTotal: 3, rowsInserted: 3, rowsDuplicate: 0, uploadedAt: '2026-09-02T10:15:00Z', uploadedBy: 'Sam Taylor' },
];

let sid = 0;
function suggestion(tid: string, payer: Suggestion['payer'], method: string, confidence: number, reason: string): Suggestion {
  const t = TENANCIES.find((x) => x.tid === tid);
  return { id: uuid('d1000000', ++sid), tid, tenantName: t?.tenantName ?? null, payer, method, confidence, reason, status: 'open' };
}

let lid = 0;
function line(batch: number, bank: string, date: string, amount: string, description: string, patch: Partial<BankLine> = {}): BankLine {
  return {
    id: uuid('e1000000', ++lid),
    bankCode: bank,
    importBatchId: IMPORTS[batch - 1]!.id,
    txnDate: date,
    amount,
    remaining: amount,
    description,
    reference: null,
    counterparty: null,
    payerAccountLast4: null,
    extractedTid: null,
    status: 'needs_review',
    exclusionReason: null,
    note: null,
    suggestions: [],
    receipts: [],
    ...patch,
  };
}

const matchedReceipt = (tid: string, payer: Suggestion['payer'], amount: string, via: string, by: string | null, ledger: string) => ({
  id: uuid('f1000000', ++lid),
  tid,
  payer,
  amount,
  ledgerCode: ledger,
  matchedVia: via,
  matchedBy: by,
});

/** A small, varied queue: every status and every kind of evidence appears at least once. */
export function seedLines(): BankLine[] {
  sid = 0;
  lid = 0;
  return [
    line(1, 'HSBC', '2026-09-01', '650.00', 'BGC BIRMINGHAM CC HB T1001', {
      reference: 'HB T1001 SEPT', counterparty: 'BIRMINGHAM CITY COUNCIL', extractedTid: 'T1001', status: 'matched', remaining: '0.00',
      suggestions: [{ ...suggestion('T1001', 'council_hb', 'tid_in_reference', 1, 'TID T1001 found in reference'), status: 'accepted' }],
      receipts: [matchedReceipt('T1001', 'council_hb', '650.00', 'tid_in_reference', null, '001B')],
    }),
    line(1, 'HSBC', '2026-09-03', '120.00', 'FPS A BROWN RENT', {
      reference: 'RENT QQ••••34D', counterparty: 'A BROWN', payerAccountLast4: '4821',
      suggestions: [suggestion('T1002', 'tenant', 'ni_in_reference', 0.6, 'NI number matches two live tenancies'), suggestion('T1007', 'tenant', 'ni_in_reference', 0.6, 'NI number matches two live tenancies')],
    }),
    line(1, 'HSBC', '2026-09-04', '540.00', 'BGC DWP UC PAYMENT', {
      reference: 'UC 0926', counterparty: 'DWP', status: 'needs_review',
      suggestions: [suggestion('T1003', 'dwp_uc', 'amount_and_name', 0.55, 'Amount equals expected UC payment; name similar')],
    }),
    line(1, 'HSBC', '2026-09-05', '1310.00', 'BGC LANDLORD PAYMENT J HOLDINGS', {
      reference: 'SEPT RENTS', counterparty: 'J HOLDINGS LTD', payerAccountLast4: '7703',
      suggestions: [suggestion('T1004', 'other_third_party', 'payer_account', 0.7, 'Landlord account covers 2 tenancies; expected payment equals amount'), suggestion('T1005', 'other_third_party', 'payer_account', 0.4, 'Landlord account covers 2 tenancies')],
    }),
    line(1, 'HSBC', '2026-09-08', '200.00', 'FPS PAYMENT', { counterparty: 'M LEE', status: 'yet_to_take', note: 'Yet to take' }),
    line(1, 'HSBC', '2026-09-10', '-8.50', 'MONTHLY ACCOUNT FEE', { status: 'excluded', exclusionReason: 'Bank charge' }),
    line(1, 'HSBC', '2026-09-12', '700.00', 'SO R PATEL T1004', {
      reference: 'T1004', extractedTid: 'T1004', status: 'partially_matched', remaining: '100.00',
      suggestions: [{ ...suggestion('T1004', 'tenant', 'tid_in_reference', 1, 'TID T1004 found in reference'), status: 'accepted' }],
      receipts: [matchedReceipt('T1004', 'tenant', '600.00', 'tid_in_reference', 'Sam Taylor', '001')],
    }),
    line(1, 'HSBC', '2026-09-15', '420.00', 'BGC J CLARKE', {
      counterparty: 'J CLARKE', payerAccountLast4: '1190', status: 'matched', remaining: '0.00',
      suggestions: [{ ...suggestion('T1007', 'tenant', 'payer_account', 0.95, 'Known payer account ••••1190'), status: 'accepted' }],
      receipts: [matchedReceipt('T1007', 'tenant', '420.00', 'payer_account', null, '001G')],
    }),
    line(1, 'HSBC', '2026-09-18', '-2500.00', 'TFR TO OPERATING ACCOUNT', { status: 'excluded', exclusionReason: 'Internal transfer' }),
    line(2, 'LLOYDS', '2026-09-02', '480.00', 'BGC LEEDS CC HB', { reference: 'HB REF 55120', counterparty: 'LEEDS CITY COUNCIL', status: 'yet_to_take', note: 'Yet to take' }),
    line(2, 'LLOYDS', '2026-09-06', '95.00', 'FPS S OKAFOR', {
      counterparty: 'S OKAFOR', reference: 'RENT T1006',
      extractedTid: 'T1006',
      suggestions: [suggestion('T1006', 'tenant', 'tid_in_reference', 0.9, 'TID T1006 found; tenancy ended 30/06/2026 (overpayment?)')],
    }),
    line(2, 'LLOYDS', '2026-09-09', '610.00', 'SO A NOVAK', { counterparty: 'A NOVAK', suggestions: [suggestion('T1008', 'tenant', 'amount_and_name', 0.5, 'Name and amount match a pending tenancy')] }),
    line(2, 'LLOYDS', '2026-09-14', '650.00', 'BGC BIRMINGHAM CC HB', { counterparty: 'BIRMINGHAM CITY COUNCIL', reference: 'HB BULK', status: 'yet_to_take', note: 'Yet to take' }),
    line(2, 'LLOYDS', '2026-09-20', '-15.00', 'CHAPS FEE', { status: 'excluded', exclusionReason: 'Bank charge' }),
    line(2, 'LLOYDS', '2026-09-25', '540.00', 'BGC DWP UC T1003', {
      reference: 'UC T1003', extractedTid: 'T1003', status: 'matched', remaining: '0.00',
      suggestions: [{ ...suggestion('T1003', 'dwp_uc', 'tid_in_reference', 1, 'TID T1003 found in reference'), status: 'accepted' }],
      receipts: [matchedReceipt('T1003', 'dwp_uc', '540.00', 'tid_in_reference', null, '001G')],
    }),
    line(3, 'HSBC', '2026-08-01', '650.00', 'BGC BIRMINGHAM CC HB T1001', {
      reference: 'HB T1001 AUG', extractedTid: 'T1001', status: 'matched', remaining: '0.00',
      suggestions: [{ ...suggestion('T1001', 'council_hb', 'tid_in_reference', 1, 'TID T1001 found in reference'), status: 'accepted' }],
      receipts: [matchedReceipt('T1001', 'council_hb', '650.00', 'tid_in_reference', null, '001B')],
    }),
    line(3, 'HSBC', '2026-08-15', '120.00', 'FPS A BROWN', {
      counterparty: 'A BROWN', payerAccountLast4: '4821', status: 'matched', remaining: '0.00',
      receipts: [matchedReceipt('T1002', 'tenant', '120.00', 'manual', 'Priya Shah', '001')],
    }),
    line(3, 'HSBC', '2026-08-20', '-8.50', 'MONTHLY ACCOUNT FEE', { status: 'excluded', exclusionReason: 'Bank charge' }),
  ];
}

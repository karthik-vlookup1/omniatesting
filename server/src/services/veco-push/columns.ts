import type { ValueKind } from './sql-literal.js';

/** The 79 columns of dbo.[Transaction], in VECO's order (keep VECO's spellings). */
export const TRANSACTION_COLUMNS = [
  'TransactionPK', 'CompanyFK', 'OfficeFK', 'StaffFK', 'OwnerGroupFK', 'EstateFK', 'PropertyFK', 'TenancyFK',
  'SupplierFK', 'ContactFK', 'FreeholderGroupFK', 'WorksOrderFK', 'strType', 'dtePosting', 'dteDate', 'dteDateFrom',
  'dteDateTo', 'strAccountPeriod', 'strPaymentMethod', 'strBankingRef', 'strChequeNumber', 'dblAmount', 'dblVAT',
  'dblGross', 'strInvoiceNumber', 'dblTaxRate', 'lngDaysDelay', 'memDescription', 'blnDeleted', 'DeletedFK',
  'DeletedByFK', 'dteDeletedDate', 'dteChequeDate', 'dblDiscount', 'strDepartment', 'strInvoiceStatus',
  'strSubDepartment', 'strStatus', 'dteStatus', 'StatusStaffFK', 'strReference', 'strTransactionStatus',
  'strBankingMethod', 'blnBankingRef', 'strBatchReference', 'strLockedUserFK', 'dteLocked', 'blnOwnerPayment',
  'strStandingOrderReference', 'memAttachment', 'blnAttachmentLocked', 'strOverrideBankingMethod',
  'strOverridePayeeName', 'strOverrideAccountNumber', 'strOverrideSortCode', 'strOverrideBACSRef',
  'OverrideAddressFK', 'blnChargedInArrears', 'dteConverted', 'dteFound', 'intRemittance', 'dteStatementPrinted',
  'dteAttachmentPrinted', 'ChargeFK', 'blnSuppress', 'strSupressedBy', 'dteSuppressed', 'blnInvoiceNumbers', 'BankFK',
  'blnEIBT', 'strSupplierEmail', 'strCategory', 'memDebug', 'dteContra', 'strContraBy', 'ContraFK', 'strDiscountType',
  'TenancyTransferFK', 'blnProfitLoss',
] as const;

export type TransactionColumn = (typeof TRANSACTION_COLUMNS)[number];

/** The 30 columns that carry a value, with their literal kind. */
export const TRANSACTION_KINDS = {
  TransactionPK: 'guid',
  CompanyFK: 'guid',
  OfficeFK: 'guid',
  StaffFK: 'guid',
  OwnerGroupFK: 'guid',
  PropertyFK: 'guid',
  TenancyFK: 'guid',
  ContactFK: 'guid',
  StatusStaffFK: 'guid',
  BankFK: 'guid',
  strType: 'str',
  strAccountPeriod: 'str',
  strBankingRef: 'str',
  memDescription: 'str',
  strDepartment: 'str',
  strStatus: 'str',
  strReference: 'str',
  strTransactionStatus: 'str',
  strBatchReference: 'str',
  strStandingOrderReference: 'str',
  dtePosting: 'dt',
  dteDate: 'dt',
  dteStatus: 'dt',
  dblAmount: 'num',
  dblVAT: 'num',
  dblGross: 'num',
  dblTaxRate: 'num',
  lngDaysDelay: 'num',
  blnDeleted: 'bit',
  blnOwnerPayment: 'bit',
} as const satisfies Partial<Record<TransactionColumn, ValueKind>>;

export type FilledTransactionColumn = keyof typeof TRANSACTION_KINDS;

export const TRANSACTION_FILLED_COLUMNS = Object.keys(TRANSACTION_KINDS) as FilledTransactionColumn[];

/** The 49 columns that are always NULL. */
export const TRANSACTION_NULL_COLUMNS: TransactionColumn[] = TRANSACTION_COLUMNS.filter(
  (c) => !(c in TRANSACTION_KINDS),
);

/** The 14 columns of dbo.Allocation. */
export const ALLOCATION_COLUMNS = [
  'AllocationPK', 'DebitTransactionFK', 'CreditTransactionFK', 'dblAmount', 'dtePosting', 'dblPercentage',
  'strAccountPeriod', 'dteStatement', 'dblTotalTax', 'dblTotalCommision', 'dblTax', 'dblCommision', 'dteDateFrom',
  'dteDateTo',
] as const;

export type AllocationColumn = (typeof ALLOCATION_COLUMNS)[number];

export const ALLOCATION_KINDS = {
  AllocationPK: 'guid',
  DebitTransactionFK: 'guid',
  CreditTransactionFK: 'guid',
  dblAmount: 'num',
  dtePosting: 'dt',
  dblPercentage: 'num',
  strAccountPeriod: 'str',
} as const satisfies Partial<Record<AllocationColumn, ValueKind>>;

export type FilledAllocationColumn = keyof typeof ALLOCATION_KINDS;
export const ALLOCATION_FILLED_COLUMNS = Object.keys(ALLOCATION_KINDS) as FilledAllocationColumn[];

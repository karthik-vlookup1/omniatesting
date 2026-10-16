/** Constants of the VECO push. Fixed in code on purpose: there is no database or UI override. */
export const TARGET_DB = 'Test Database Read Write';
export const COMPANY_FK = '46F81970-9647-46A5-B5B3-352150533B39';
export const BANK_FK = '877A0B7D-802E-4C49-88C7-A74337DCD08F';
export const BANK_SORT = '20-79-06';
export const BANK_ACCOUNT = '43789276';
export const MAX_PUSH_RECEIPTS = 500;

export type Department = 'Owner' | 'Tenancy';
export const DEPARTMENTS: readonly Department[] = ['Owner', 'Tenancy'];

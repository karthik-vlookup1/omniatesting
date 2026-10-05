/** Pure CSV parsing/validation for the LetMC import: no database. Synthetic data only. */
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import { parseLetmcCsv, type TenancyData, type TenantData } from '../../src/jobs/letmc-import/parse.js';

const bad = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).message;
  }
  throw new Error('expected AppError');
};

describe('parseLetmcCsv', () => {
  it('handles a BOM, CRLF, blank lines, quoted commas and header aliases in any case', () => {
    const csv = '﻿landlordid,  NAME ,e-mail,Telephone\r\n\r\nL1,"Smith, Jones & Co",a@example.test,01234 567890\r\n\r\nL2,Plain Name,,\r\n';
    const rows = parseLetmcCsv(Buffer.from(csv, 'utf8'), 'landlords');
    expect(rows.map((r) => r.key)).toEqual(['L1', 'L2']);
    expect(rows[0]!.data).toMatchObject({ name: 'Smith, Jones & Co', phone: '01234 567890' });
    // line numbers are physical file lines, counting the blank ones
    expect(rows.map((r) => r.line)).toEqual([3, 5]);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('refuses empty, header-only, unreadable and too-large files and names missing columns', () => {
    expect(bad(() => parseLetmcCsv(Buffer.alloc(0), 'landlords'))).toMatch(/no header/i);
    expect(bad(() => parseLetmcCsv('Landlord Ref,Landlord Name\n', 'landlords'))).toMatch(/no data rows/i);
    expect(bad(() => parseLetmcCsv('Landlord Ref,Email\nL1,a@example.test\n', 'landlords'))).toContain('Landlord Name');
    expect(bad(() => parseLetmcCsv('Landlord Ref,Landlord Name\nL1,"unterminated\n', 'landlords'))).toMatch(/not a readable CSV/);
    expect(bad(() => parseLetmcCsv(Buffer.from([0xff, 0x00, 0x01, 0x02, 0x03]), 'landlords'))).toMatch(/Missing columns|not a readable/);
    const many = 'Landlord Ref,Landlord Name\n' + Array.from({ length: 5001 }, (_, i) => `L${i},N${i}`).join('\n');
    expect(bad(() => parseLetmcCsv(many, 'landlords'))).toContain('5000');
  });

  it('turns money into integer pence, signed, in several notations', () => {
    const csv = [
      'Tenancy Ref,Balance',
      'T1001,"£1,234.50"',
      'T1002,(45.00)',
      'T1003,-0.29',
      'T1004,',
      'T1005,19.99',
      'T1006,"1,23"',
    ].join('\n');
    const rows = parseLetmcCsv(csv, 'tenancies');
    expect(rows.slice(0, 5).map((r) => (r.data as TenancyData).balance_pence)).toEqual([123450, -4500, -29, 0, 1999]);
    expect(rows[5]!.errors).toEqual([expect.objectContaining({ field: 'Balance' })]);
  });

  it('validates dates, payer, tid, and end before start', () => {
    const csv = [
      'Tenancy Ref,Start Date,End Date,Balance Payer',
      'T1001,01/04/2024,2025-03-31,hb',
      'T1002,2025-03-31,01/04/2024,',
      'T1003,31/02/2024,,UC',
      'X1,01/04/2024,,landlord',
    ].join('\n');
    const rows = parseLetmcCsv(csv, 'tenancies');
    expect(rows[0]!.errors).toEqual([]);
    expect((rows[0]!.data as TenancyData).balance_payer).toBe('council_hb');
    expect(rows[1]!.errors.map((e) => e.field)).toEqual(['End Date']);
    expect(rows[2]!.errors.map((e) => e.field)).toEqual(['Start Date']);
    expect(rows[3]!.errors.map((e) => e.field).sort()).toEqual(['Balance Payer', 'Tenancy Ref']);
  });

  it('marks an identical repeat as a duplicate and a conflicting repeat as an error', () => {
    const csv = ['Landlord Ref,Landlord Name', 'L1,One', 'L1,One', 'l1,Different'].join('\n');
    const rows = parseLetmcCsv(csv, 'landlords');
    expect(rows[1]!.duplicateOf).toBe(2);
    expect(rows[1]!.errors).toEqual([]);
    expect(rows[2]!.errors[0]).toMatchObject({ field: 'Landlord Ref' });
    expect(rows[2]!.errors[0]!.reason).toContain('row 2');
  });

  it('never echoes NI numbers or e-mail addresses in row errors, and rejects a repeated NI', () => {
    const csv = [
      'Tenant Ref,First Name,Surname,Email,NI Number',
      'LT1,A,One,not-an-email-zzz,QQ1234',
      'LT2,B,Two,,AB200001C',
      'LT3,C,Three,,ab 20 00 01 c',
    ].join('\n');
    const rows = parseLetmcCsv(csv, 'tenants');
    expect(rows[0]!.errors.map((e) => e.field).sort()).toEqual(['Email', 'NI Number']);
    expect(rows[1]!.errors).toEqual([]);
    expect(rows[2]!.errors).toEqual([expect.objectContaining({ field: 'NI Number' })]);
    const text = JSON.stringify(rows.map((r) => r.errors));
    for (const secret of ['not-an-email-zzz', 'QQ1234', 'AB200001C', 'AB 20 00 01']) expect(text).not.toContain(secret);
    expect((rows[1]!.data as TenantData).ni).toBe('AB200001C');
  });

  it('validates postcode, phone, bedrooms and management type', () => {
    const csv = [
      'Property Ref,Postcode,Bedrooms,Management Type',
      'P1,zz22zz,3,rg',
      'P2,XYZ,abc,XX',
      'P3,,51,',
    ].join('\n');
    const rows = parseLetmcCsv(csv, 'properties');
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.data).toMatchObject({ postcode: 'ZZ2 2ZZ', bedrooms: 3, management_type: 'RG' });
    expect(rows[1]!.errors.map((e) => e.field).sort()).toEqual(['Bedrooms', 'Management Type', 'Postcode']);
    expect(rows[2]!.errors.map((e) => e.field)).toEqual(['Bedrooms']);
  });
});

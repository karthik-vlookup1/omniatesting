# LetMC import fixtures

Synthetic data only. Refs `L80xx`, `P80xx`, `LT80xx`, `T80xx` are new records; `P9000`, `T9001`, `T9002`, `T9003`
and the NI number `AB100001C` belong to the synthetic Veco rows (`server/test/fixtures/veco-rows.ts`, 3 rows).

Import in order: landlords, properties, tenants, tenancies (with opening balances at a cutover date).
Each type has a mixed file (clean rows, one identical duplicate, bad rows) and a `-clean` file (clean rows only).

## Layout

Headers are matched ignoring case, spacing and punctuation. Aliases are listed in
`server/src/jobs/letmc-import/layout.ts`; when the real LetMC export names a column differently, add the name there.

| Type | Columns (required in bold when the file is read) |
| --- | --- |
| landlords | **Landlord Ref** (LandlordID, Landlord Code), **Landlord Name** (Name), Email, Phone (Telephone, Mobile) |
| properties | **Property Ref** (Property ID), Branch\*, Landlord Ref, Address 1\*, Address 2, Town, Postcode\*, Bedrooms, Management Type |
| tenants | **Tenant Ref** (Tenant ID), Title, **First Name** (Forename), **Surname** (Last Name), Email, Mobile (Phone), NI Number (NINO) |
| tenancies | **Tenancy Ref** (TID), Property Ref\*, Unit Ref, Tenant Ref\*, Management Type, Start Date\*, End Date, Balance (Arrears, Opening Balance), Balance Payer |

\* needed per row only when the record does not exist yet.

Dates are `DD/MM/YYYY` or ISO `YYYY-MM-DD`. `Balance` is signed pounds: positive = arrears owed, negative = credit;
`(45.00)` and `£1,234.50` are accepted, blank = 0. `Balance Payer` is tenant (default), hb, uc or other.

## Precedence (Veco vs LetMC)

Veco owns active tenancies and a property's branch, address line 1, postcode and management type. The import never
overwrites a value Recon already has: it fills blanks and reports differences as warnings. A tenancy not in Recon
with no End Date (or one in the future) is rejected: run the Veco sync first. A past End Date creates an ended tenancy.

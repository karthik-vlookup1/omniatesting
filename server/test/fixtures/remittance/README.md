# Remittance fixtures

Synthetic data only. `T9001`, `T9002`, `T9003` are the synthetic Veco tenancies
(`server/test/fixtures/veco-rows.ts`); `HBC-77001` is a claim reference the tests give to `T9003`
through a benefit award.

- `remittance.csv`: 3 valid rows totalling 450.00 (two matched by TID, one by Claim Ref only).
- `remittance-bad.csv`: the same 3 rows plus 3 bad ones: an unknown TID (line 5), an Amount of `1,23`
  that could be a decimal comma (line 6) and a row with neither TID nor Claim Ref (line 7).

## Layout

Headers are matched ignoring case, spacing and punctuation (`server/src/domain/remittance/layout.ts`).
The file needs an Amount column and at least one of TID / Claim Ref.

| Column | Also accepted as | Required |
| --- | --- | --- |
| TID | Tenancy Ref, Tenancy ID | each row needs a TID or a Claim Ref |
| Claim Ref | Claim Reference, Claim No, HB Ref | each row needs a TID or a Claim Ref |
| Tenant Name | Name, Claimant | no |
| Period From | From, Start Date | no |
| Period To | To, End Date | no |
| Amount | Amount Paid, Payment, Paid | yes, more than zero |

There is no National Insurance column: remittances are matched by TID or claim reference only.
Dates are `YYYY-MM-DD` or `DD/MM/YYYY`; at most 2000 rows.

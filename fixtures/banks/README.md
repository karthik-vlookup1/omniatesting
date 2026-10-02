# Synthetic bank statements

Every value here is invented: TIDs `T9xxx`, NI numbers `AB10xxxxC` / `CE123456D` (valid format,
nobody's), sort codes `00-00-xx`, account numbers `1234xxxx`, names "Test …". No real bank data.

One file per default bank profile (`server/src/domain/ingest/profiles.ts`), each with a different
column order, header names, amount style and date format:

| File | Bank code | Layout |
|---|---|---|
| hsbc.csv | HSBC | Date, Description, Paid in / Paid out, Balance; DD/MM/YYYY |
| lloyds.csv | LLOYDS | Transaction Date first, Debit before Credit; DD/MM/YYYY |
| apollo_tw.csv | APOLLO_TW | TransferWise ID, signed Amount, Payment Reference, Payer Name; DD-MM-YYYY |
| redstone.csv | REDSTONE | signed Amount, counterparty sort code + account; YYYY-MM-DD |
| army.csv | ARMY | 3 preamble lines, Money In / Money Out; DD/MM/YY |
| isl.csv | ISL | payer sort code + account, Credit / Debit; DD/MM/YYYY |
| other_recon_format.csv | OTHER | the earlier Recon app's format incl. Current Tenancy ID |

Test-only files: `hsbc_overlap.csv` (shares 2 lines with hsbc.csv), `hsbc_wrong_layout.csv`,
`hsbc_bad_rows.csv`, and `hsbc_business.csv`: the layout of the real Apollo HSBC export shown in the
accounts procedure (Date, Type CR/BP, Description, one signed Amount, Balance; dates like 02-Oct-26),
which the HSBC profile must also read. Values are invented.

# Rental income processing (current manual process)

Transcribed from *Omnia Rental Income Processing Flow Chart.pdf*. This is the process Omnia Recon replaces.

1. **Get the bank statements.** Collect the latest statements for HSBC, Lloyds, Apollo TW, Redstone, Army and ISL. Confirm that every statement for the period has arrived.

2. **Update the "Bank Statement 2025/26" Google Sheet.**
   - Add the Tenancy ID (TID) to each rent transaction.
   - Record every incoming rent payment.
   - Leave out all expenses.
   - If a payment looks like rent but has no reference or TID, add the note **"Yet to take"**.

3. **Update the "Xero 2025/26" Google Sheet.** An import formula copies the TID and related data across from the Bank Statement sheet. For each rent transaction, check:
   - TID, bank, rent amount, date, tenant name, MG/RG status;
   - property address, Property ID and branch;
   - BD (back-dated), End/OP (ended-tenancy overpayment), and UC/HB.

   Then assign the Xero ledger code:

   | Payment type | Status | Ledger code |
   |---|---|---|
   | Regular rental income | RG | 001 |
   | Regular rental income | MG | 001B |
   | Regular rental income | IRG | 001G |
   | Back-dated rental payment | RG | 206 |
   | Back-dated rental payment | MG | 207 |
   | Back-dated rental payment | IRG | 208 |
   | Ended-tenancy overpayment | any | 001C |

   Correct anything missing or inconsistent. The Xero sheet must agree with the Bank Statement sheet.

4. **Review the "Rental Income for Xero 2025/26" sheet.** Check:
   - the data imported correctly;
   - the ledger codes;
   - branch, address, Property ID, TID and tenant;
   - the invoice details;
   - the format is right for Xero;
   - there are no missing or duplicate rows.

   If anything is wrong, fix it and review the sheet again.

5. **Build the upload file.** Copy the required columns into the CVC Excel upload file, then save it as CSV.

6. **Import into Xero.** Go to Sales → Invoices → Import, and upload the CSV. Xero creates draft invoices.

7. **Review the drafts.** Check the tenant, amount, ledger code, branch and property, and date against the source sheets.
   - If anything is wrong, fix the source or the draft and review again.
   - Once everything is correct, approve the invoices, individually or in bulk. They then post in Xero.

Also, outside this flow chart: staff record each receipt in **LetMC** (being retired) and re-key **TID + amount** into **Vico** (RDP).

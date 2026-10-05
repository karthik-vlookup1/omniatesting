# Plan recon-104: Known payer accounts (hash + last4) linked to a tenancy or a landlord

## Goal
Staff add, list, deactivate/reactivate known payer bank accounts (tenant, relative, landlord) on a tenancy or landlord, writing the SAME
`payer_bank_accounts` rows that 002 `suggest_matches` step 3 reads and `confirm_match(remember)` writes. Only hash + last4 are ever stored or returned.

## Files
Create: db/migrations/007_payer_accounts.sql; server/src/services/payer-account/payer-account.service.ts; server/src/api/payer-account/routes.ts;
web/src/features/payer-accounts/{api.ts,PayerAccountsPage.tsx,AddPayerAccountModal.tsx}; server/test/int/payer-account.test.ts.
Modify: server/src/api/app.ts; web/src/app/routes.tsx; web/src/app/navigation.ts. Layout copies recon-101 (landlord service/routes/page). No matching/ingest/crypto edits.

## Steps
1. 007 (BEGIN/COMMIT): DO block drops the holder_type CHECK found via `pg_constraint WHERE conrelid='payer_bank_accounts'::regclass AND contype='c' AND
   pg_get_constraintdef(oid) LIKE '%holder_type%'`, then `ADD CONSTRAINT payer_bank_accounts_holder_type_check CHECK (holder_type IN ('landlord','tenant',
   'relative','guarantor','council','dwp','other'))`. Reason: "relative" shows in the matching reason text ("Paid from known relative account (Jane) ending 1234").
2. 007: `CREATE UNIQUE INDEX payer_account_landlord_uq ON payer_bank_accounts (account_hash, landlord_id) WHERE tenancy_id IS NULL AND landlord_id IS NOT NULL;`
   (002 already has payer_account_tenancy_uq for tenancy links).
3. 007: `UPDATE payer_bank_accounts SET sort_code = NULL WHERE sort_code IS NOT NULL;` plus BEFORE INSERT OR UPDATE trigger fn `strip_payer_sort_code()`
   (`NEW.sort_code := NULL; RETURN NEW;`). Reason: nothing reads that column (grep: only the db test inserts it); this enforces "no full sort codes" for
   confirm_match's remember path too without touching excluded matching code. The audit trigger from 002 already covers this table.
4. Hashing (service doc comment states it): key = sort code digits (exactly 6, `\D` stripped) || account number digits (6-10, `\D` stripped, NO zero
   padding) -> `payerAccountHash(sortCode, accountNumber, hashKey)` from lib/crypto = SQL `secure_hash(regexp_replace(sc,'\D','','g') || acc)`; identical
   to ingest readPayerAccount, so bank lines hash the same. Stored: account_hash, account_last4 = last 4 account digits, sort_code NULL. Shown: `maskAccount(last4)`.
5. Service `list(pool, {tid?, landlordId?})`: SELECT pba.id, account_last4, holder_type, holder_name, payer, is_active, learned_from_txn IS NOT NULL AS learned,
   created_at, t.tid, pba.landlord_id, l.name AS landlord_name, (SELECT count(*) FROM payer_bank_accounts o WHERE o.account_hash = pba.account_hash AND o.is_active
   AND o.id <> pba.id) AS shared_with; LEFT JOIN tenancies/landlords; filter by upper(tid) or landlord_id; ORDER BY created_at DESC LIMIT 200.
   Never select account_hash or sort_code into the response. Row camelCase: {id, account:'****1234', holderType, holderName, payer, isActive, source:'manual'|'learned', tid, landlordId, landlordName, sharedWith, createdAt}.
6. Service `add(db: ActorDb, hashKey, input)` in db.tx: resolve tid -> tenancy id (`upper(tid)`; none -> AppError('bad_request','Unknown tenancy')); landlordId
   -> exists check (none -> 'Unknown landlord'). Compute hash. `SELECT ... FOR UPDATE` same hash + same target (tenancy_id=$t, or landlord_id=$l AND tenancy_id IS NULL).
   Active -> AppError('conflict','This account is already linked here'). Inactive -> UPDATE is_active=true, holder_type, holder_name, payer; return {row, created:false}.
   Else INSERT (account_hash, account_last4, holder_name, holder_type, tenancy_id|landlord_id, payer) -> {row, created:true}. 23505 -> conflict (race).
7. Service `update(db, id, {holderName?, payer?, isActive?})` via fixed key->column map (recon-101 style); no row -> not_found. Works on learned rows too.
8. routes.ts `payerAccountsRouter({pool, hashKey})`, `router.use(requireAuth)`: GET / (any role, query {tid?: `^[Tt]\d{3,6}$`, landlordId?: uuid}) -> {payerAccounts};
   POST / requireWriter -> 201 (created) or 200 (reactivated) with {payerAccount}; PATCH /:id requireWriter (non-uuid -> not_found) -> {payerAccount}.
   Zod `.strict()`: sortCode `^\d{2}[- ]?\d{2}[- ]?\d{2}$`; accountNumber `^\d{6,10}$` after removing spaces (z.string().transform strip `\s` then regex);
   holderType enum tenant|relative|landlord; holderName trim 1-100 nullish; payer enum payer_type default 'tenant'; tid / landlordId: refine exactly one.
   Field names stay sortCode/accountNumber so logger redaction applies. Validation messages must not echo the input.
9. app.ts: import and mount `app.use('/api/payer-accounts', payerAccountsRouter({ pool, hashKey: config.hashKey }));` right after `/api/rent`.
10. web api.ts: fetchers via apiRequest + react-query hooks copied from features/landlords/api.ts (key ['payer-accounts', filter]; invalidate on mutate).
11. PayerAccountsPage (/payer-accounts): Title "Known payer accounts"; filters TextInput "Tenancy ID" and Select "Landlord" (clearable, from landlords
    list); Table aria-label "Known payer accounts" (Account, Holder, Type, Pays for, Linked to, Source, Status); per row a button aria-label
    "Deactivate ****1234" / "Reactivate ****1234" shown only if can(user,'write'); "Add payer account" button only if can(user,'write').
12. AddPayerAccountModal: NativeSelect "Link to" (Tenancy|Landlord) -> TextInput "Tenancy ID" or Select "Landlord"; NativeSelect "Account holder"
    (Tenant, Relative, Landlord); TextInput "Holder name"; TextInput "Sort code"; TextInput "Account number" (autoComplete="off"); NativeSelect "Pays for"
    (Tenant share, Council (HB), DWP (UC), Other third party). Form state is reset on close/success; full numbers never enter the query cache.
    If response sharedWith > 0 show Alert "This account is also linked to N other tenancy or landlord; matches from it will need review."
13. routes.tsx: lazy child `payer-accounts`. navigation.ts: after Bank accounts add `{label:'Payer accounts',to:'/payer-accounts',icon:IconWallet}`.

## Tests (server/test/int/payer-account.test.ts; harness + TRUNCATE + syncTenancies(vecoRows(20)) + bank defaults + upload helper copied from matching.test.ts)
 1 staff adds tenant account 00-00-10/12340010 to T9010 -> 201; DB: account_hash = secure_hash('00001012340010'), last4 '0010', sort_code NULL;
   JSON.stringify(body) contains neither '12340010' nor '000010'. 2 GET ?tid=t9010 -> account '****0010', no accountHash/sortCode keys.
 3 same again -> 409; PATCH isActive false -> 200; POST again -> 200 same id, isActive true.
 4 upload REDSTONE CSV line from 00-00-10/12340010, ref 'RENT-<run>' -> matching {autoMatched:1}; receipt on T9010; suggestion method payer_account.
 5 relative account (holderName 'Jane Relative') on T9011 + upload -> match_suggestions.reason LIKE 'Paid from known relative account (Jane Relative) ending%'.
 6 create landlord, set landlord_id on the properties of T9012 and T9013; link account to landlord -> upload -> 2 open payer_account suggestions, autoMatched 0.
 7 confirm another line with remember:true -> learned row has sort_code NULL and GET lists it with source 'learned'.
 8 400s: sortCode '12-34', accountNumber '123', both tid+landlordId, neither, unknown tid ('Unknown tenancy'), unknown landlord uuid; no 400 body contains the digits.
 9 readonly POST/PATCH -> 403, GET 200; PATCH random uuid -> 404; missing CSRF -> 403.
10 audit_log INSERT row for payer_bank_accounts with changed_by = staff e-mail. 11 `count(*) WHERE sort_code IS NOT NULL` = 0.

## Edge cases
Same account on several tenancies (allowed; matching lowers confidence; UI warns); 7-digit accounts hashed unpadded (as ingest); learned rows editable;
deactivated rows ignored by matching (is_active filter already in 002); tid in any case.

## Risks / rollback
Hash parity with ingest is the core risk -> test 4 proves it end to end. bank_transactions.payer_sort_code still holds full sort codes (ingest, excluded).
Rollback: revert commit; DROP TRIGGER/function strip_payer_sort_code, DROP INDEX payer_account_landlord_uq, restore the original CHECK (no 'relative').

## Out of scope
Deletes; "is this account known?" lookup by full number; tenant_id links; editing ingest/matching; link from tenancy/landlord pages (excluded folders).

## Verify
Kill 3001/5173; TEST_DATABASE_URL on 5433. `npm run test:int -- payer-account` (11 passed), then full `npm run test:int` (matching/ingest green),
`npm run db:test` (OMNIA_DB_PORT=5433), lint, typecheck.

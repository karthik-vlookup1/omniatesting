# Plan recon-101: Branches, bank accounts, landlords, properties (API + UI)

## Goal
List/search, create and edit for branches, bank accounts, landlords and properties; every write audited as the signed-in user.

## Files
Create: db/migrations/005_reference_data_audit.sql; server/src/services/{branch,bank-account,landlord,property}/<name>.service.ts;
server/src/api/{branch,bank-account,landlord,property}/routes.ts; web/src/features/{branches,bank-accounts,landlords,properties}/{api.ts,<X>Page.tsx,<X>FormModal.tsx};
server/test/int/property.test.ts; e2e/property.spec.ts.  Modify: server/src/api/app.ts; web/src/app/routes.tsx + navigation.ts (scope approved 2026-10-05).
Folders use the singular names from the scope globs (lesson 2026-10-02). Web data hooks go in features/<x>/api.ts because web/src/data/** is out of scope.

## Steps
1. 005_reference_data_audit.sql: `BEGIN;` then 4x `CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON <t> FOR EACH ROW EXECUTE FUNCTION audit_row();`
   for branches, bank_accounts, landlords, properties; `COMMIT;` (same style as 003). Reason: none of the four tables is audited yet.
2. Services (all four): `list(pool, {q, ...})`, `create(db: ActorDb, input)`, `update(db, id, patch)`. Writes run in `db.tx` (sets app.user_email).
   Search = `ILIKE '%'||$1||'%'` with % _ \ escaped; ORDER BY code/ref/name; LIMIT 200. Map 23505 -> AppError('conflict'),
   23503 -> AppError('bad_request','Unknown branch' | 'Unknown landlord'). Update: build SET from a fixed key->column map for the keys
   that were sent, `RETURNING id`; no row -> AppError('not_found'). Return camelCase rows (same mapping style as ingest listBankAccounts).
3. branch: q matches code, name. Row {id, code, name, xeroTrackingOption}. Code is uppercased on create and immutable (Veco sync keys on it).
4. bank-account: create inserts code (uppercased), bank_name, account_name, sort_code_last2, account_last4, xero_account_id; `get(pool,id)` returns
   those + isActive; update allows everything except code. Never accept or store full sort codes or account numbers.
5. landlord: q matches name, landlord_ref, email. Row {id, landlordRef, name, email, phone}. landlordRef is editable (internal only).
6. property: list joins branches (branchCode) and LEFT JOIN landlords (landlordName); filters q (property_ref, address_line1, town, postcode),
   branchId, status active|inactive|all (default all). property_ref is immutable (Veco/Xero key). The service doc comment notes that Veco sync
   overwrites branch, address_line1, postcode, management type and is_active.
7. Zod schemas (in each routes.ts, `.strict()`): code `^[A-Za-z0-9_]{2,20}$` (bank), `^[A-Za-z0-9]{2,10}$` (branch); name/bankName/accountName
   trim 1-100; landlord name 1-200; email `z.email()`; phone `^[0-9 +()-]{6,20}$`; sortCodeLast2 `^\d{2}$`; accountLast4 `^\d{4}$`;
   xeroAccountId/xeroTrackingOption/brma/town max 100; propertyRef `^[A-Za-z0-9-]{1,30}$`; addressLine1 1-200, addressLine2 max 200;
   postcode trimmed+uppercased, `^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$`; bedrooms int 0-50; defaultManagementType enum RG|MG|IRG; isActive boolean.
   Optional fields are `.nullish()`. Patch = create schema minus immutable key, plus isActive, all `.partial()`, with
   `.refine(o => Object.keys(o).length > 0, 'nothing to change')`. A non-uuid `:id` -> AppError('not_found').
8. Routes (each `router.use(requireAuth)`): branchesRouter GET / (any), POST / + PATCH /:id `requireRole()`. bankAccountAdminRouter:
   POST / + GET /:id + PATCH /:id, all `requireRole()`, and NO `GET /`. landlordsRouter and propertiesRouter: GET / any; POST / + PATCH /:id
   `requireWriter`. Responses: list `{branches|landlords|properties: [...]}`, create 201 `{id}`, patch 200 `{<entity>: row}`.
9. app.ts: import the 4 routers; mount `/api/branches`, `/api/landlords`, `/api/properties` after `/api/users`. Mount
   `app.use('/api/bank-accounts', bankAccountAdminRouter({ pool }))` on the line BEFORE the existing ingest bankAccountsRouter. Reason: ingest
   files are excluded; the new POST / accepts a superset of ingest's body and returns the same 201 `{id}`, so ingest.test still passes.
10. web features/<x>/api.ts: fetchers via `apiRequest` from `../../lib/api`, plus react-query hooks copying the shape of data/tenancies/queries.ts
    (keys `['branches',...]` etc.; invalidate `all` on mutation success). Bank-accounts list calls GET /bank-accounts and filters client-side on q.
11. <X>Page.tsx (mirror TenanciesPage + UsersPage): Title heading (Branches / Bank accounts / Landlords / Properties); TextInput label "Search",
    debounced 300 ms; Table aria-label = page title; each row has a `<button aria-label="Edit <code|ref|name>">` (lesson: rows need a
    focusable control); an "Add <entity>" button shown only when `can(user,'settings')` (branches, bank accounts) or `can(user,'write')`
    (landlords, properties). The FormModal (mirror UserFormModal) is used for create and edit; the immutable key is disabled when editing; server
    errors are shown in an Alert. Property form: Select "Branch" (from branches list), Select "Landlord" (clearable), and a note that Veco sync
    overwrites the synced fields.
12. routes.tsx: add 4 children `branches`, `bank-accounts`, `landlords`, `properties`, lazy like `tenancies`.
13. navigation.ts: after Tenancies add `{label:'Properties',to:'/properties',icon:IconHome2}`, `{label:'Landlords',to:'/landlords',icon:IconUserStar}`,
    `{label:'Branches',to:'/branches',icon:IconBuilding}`, `{label:'Bank accounts',to:'/bank-accounts',icon:IconCreditCard}`.

## Tests
server/test/int/property.test.ts (harness copied from tenancies-api.test.ts; signIn for 4 roles; refs suffixed with `run`; no TRUNCATE):
 1 admin creates branch -> 201; code stored uppercase. 2 duplicate branch code -> 409. 3 staff POST branch -> 403. 4 PATCH branch name + xeroTrackingOption -> 200;
 sending code -> 400. 5 GET /api/branches?q=<part of name> finds it (readonly 200). 6 admin POST bank account with last2/last4 -> 201; GET /:id returns them.
 7 sortCodeLast2 '123' -> 400. 8 PATCH bank isActive false -> GET /api/bank-accounts (ingest list) shows isActive false. 9 accounts PATCH bank -> 403.
 10 staff creates landlord -> 201; bad email -> 400. 11 landlord search by ref and by email. 12 staff creates property (branch+landlord, postcode 'sw1a1aa')
 -> stored 'SW1A1AA' or 'SW1A 1AA' as sent uppercased; list row has branchCode + landlordName. 13 property search by postcode fragment and by town;
 branchId filter. 14 unknown branchId -> 400 'Unknown branch'. 15 readonly POST/PATCH property -> 403; missing CSRF header -> 403.
 16 PATCH property town + landlordId null -> 200; PATCH {} -> 400; random uuid -> 404. 17 audit_log has INSERT+UPDATE for the property with
 changed_by = staff e-mail. 18 audit_log has an INSERT for the branch with changed_by = admin e-mail.
e2e/property.spec.ts (seed like tenancies.spec: create-user admin + readonly via runTs, no shell):
 A admin: nav Branches -> Add branch E2EB -> row visible; nav Landlords -> add "E2E Landlord"; nav Properties -> add P-E2E-1 (branch E2EB,
   landlord, postcode "E2 7AA") -> Search "E2 7" shows 1 row -> "Edit P-E2E-1" -> change Town -> row shows the new town.
 B admin: Bank accounts -> Add E2EBANK (last4 1234) -> Edit -> untick Active -> row shows Inactive.
 C readonly: Properties page lists P-E2E-1; no "Add property" button and no Edit buttons.

## Edge cases
Postcode with or without the space; empty q returns the first 200; `%` in q is matched literally; nullable fields can be cleared with null;
branch/landlord FK errors; Veco-created branch (name = code) can be renamed without a later sync undoing it (sync uses DO NOTHING).

## Risks / rollback
Mounting before ingest shadows only POST /; GET /, /defaults and /:id/profile fall through, so run the full `npm run test:int`. The new audit triggers
add rows on Veco sync property updates, but an identical re-sync writes no audit rows (WHERE guard), so veco-sync.test keeps passing.
Rollback: revert the commit and `DROP TRIGGER t_audit ON <t>` for the 4 tables.

## Out of scope
Deletes; property_units CRUD; editing CSV profiles; pagination beyond 200; changing ingest routes or web/src/data/**.

## Verify
Kill listeners on 3001/5173 first; `$env:E2E_DATABASE_URL='postgres://omnia:omnia_local_dev@localhost:5433/omnia_e2e'`;
`npm run test:int -- property` (18 passed) and `npm run test:e2e -- property` (3 passed), then the full `npm run test:int` (ingest/veco suites still green).

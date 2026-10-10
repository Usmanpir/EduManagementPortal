# Architecture and security model

## Request flow

1. **Proxy** (`src/proxy.ts`) — redirects signed-out visitors away from app pages (an optimistic check only) and sets a per-request nonce Content-Security-Policy.
2. **`route()`** (`src/server/http/api.ts`) wraps every API handler, in this order:
   same-origin check (CSRF) → session → required permissions (`permission`, `anyPermission`, `guard`) → read-only guard for suspended subscriptions → per-user write rate limit → Zod validation of query/body → handler → error mapping (internal errors become a generic message; details only go to the server log).
   Platform routes add `platform: true`, which checks the super-admin session first.
3. **Services** (`src/server/modules/*`) receive a `TenantContext` and use `ctx.db`.

## Tenant isolation

- `tenantDb(orgId)` (`src/server/db/tenant.ts`) is a Prisma client extension that adds `organizationId` to every read, update and delete, and stamps it on every create, for all tenant models. A foreign id is therefore "not found", never "forbidden" — nothing confirms it exists.
- Ids supplied by clients (a `sectionId`, `invoiceId` in a body) are always loaded through `ctx.db` before use.
- Raw SQL is rare and always filters by `organizationId` explicitly (e.g. the payment row lock).
- Tested by `tests/integration/security-sweep.test.ts` (every route) and targeted tests (foreign-id injection, mass assignment).

## Authorization

- Permissions: `src/lib/permissions.ts`; seven built-in roles per school plus custom roles. Users can't grant permissions they don't hold; at least one active administrator always remains.
- Data scope: without `records.all`, staff only see sections they teach or are class teacher of (`accessibleSectionIds`). Campus-restricted roles see one campus.
- Family portal: `src/server/modules/portal/service.ts` — `myStudents()` is the only source of which students a parent or student may see; ids from the URL only pick from that list. Families only ever see published results.

## Authentication

- Argon2id password hashes; sessions are random tokens stored hashed in Postgres; cookie is `HttpOnly`, `SameSite=Lax`, and in production `Secure` with the `__Host-` prefix.
- Sign-in throttling counts failures per account and per IP (successful sign-ins are never throttled — a whole school may share one IP). Password reset tokens are single-use and revoke existing sessions.

## Data protection

- Uploaded files: type decided by content (magic bytes), size-limited, stored outside the web root (or S3), served only through HMAC-signed links that expire after 15 minutes, with a sandboxing CSP.
- Integration secrets (WhatsApp/SMS) are AES-256-GCM encrypted with `ENCRYPTION_KEY`, only ever displayed masked, and excluded from audit logs.
- Spreadsheet exports neutralise formula injection. Every export, print and sensitive change is written to the audit log.

## Background work

- Outbox pattern: notifications are written to `notification_deliveries` with a unique dedupe key, then sent by the worker with retries and backoff. Re-running a job never double-sends.
- Daily tasks claim a `(task, organization, date)` row before running, so concurrent workers or cron retries are safe.

## Money

- Amounts are `Decimal` in Postgres and handled as integer paisa/cents in code (`toCents`/`fromCents`).
- Recording a payment locks the invoice row (`SELECT … FOR UPDATE`), rejects overpayment, and is idempotent via a client-generated key.
- SaaS billing is manual: platform staff issue invoices and record bank transfers; a recorded payment is the only way a subscription becomes active.

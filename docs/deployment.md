# Deploying EduAttend

EduAttend runs as three processes sharing one PostgreSQL database:

| Process | Image target | Role |
| --- | --- | --- |
| **web** | `web` | Next.js standalone server (pages + API). Health check: `GET /api/health`. |
| **worker** | `tools` | Sends queued WhatsApp/SMS/email and runs daily tasks (absence alerts, fee reminders, overdue invoices, subscription lifecycle). |
| **migrate** | `tools` | One-shot on each deploy: `prisma migrate deploy` + `npm run platform:sync`. |

The worker can be replaced by an HTTP cron hitting `GET /api/cron` every 1–5 minutes with `Authorization: Bearer $CRON_SECRET` — run one or the other, not both.

## 1. Configure

```bash
cp .env.example .env.production
```

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | ✓ | Public https URL, e.g. `https://app.example.com` (used in emails, links, sitemap). |
| `DATABASE_URL` | ✓ | With the bundled compose file: `postgresql://eduattend:<POSTGRES_PASSWORD>@postgres:5432/eduattend?schema=public` |
| `POSTGRES_PASSWORD` | ✓ (compose) | Password for the bundled Postgres container. |
| `AUTH_SECRET` | ✓ | ≥ 32 random characters. Signs file links and the staff check-in QR codes. Rotating it invalidates open file links and the day's QR codes (sessions are unaffected). |
| `ENCRYPTION_KEY` | ✓ | 32 random bytes, base64. Encrypts schools' WhatsApp/SMS credentials. **Back it up — losing it makes stored credentials unreadable.** |
| `NODE_ENV` | ✓ | `production` (enables Secure/`__Host-` cookies and HSTS). |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` | for email | `resend` with an API key from resend.com. `console` only logs emails. |
| `STORAGE_PROVIDER` | | `local` (files in `/app/storage`, a Docker volume) or `s3` with `S3_*` for any S3-compatible store. Use `s3` if you run more than one web instance. |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | optional | Platform-wide fallback WhatsApp number. Schools can connect their own in Settings → Notifications. |
| `CRON_SECRET` | if using `/api/cron` | Random string. |
| `BILLING_PAYMENT_INSTRUCTIONS`, `BILLING_CONTACT_EMAIL`, `BILLING_GRACE_DAYS` | recommended | Shown to schools on Settings → Billing and invoices; grace period before a lapsed account becomes read-only. |
| `APP_VERSION` | optional | Shown by `/api/health`; set it to the release tag or commit. |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_KEY
```

> `docker compose --env-file`/`env_file` understands quoted values. Plain `docker run --env-file` does **not** — it passes the quotes through — so write values without quotes there.

## 2. Run (single server with Docker Compose)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f web worker
```

`web` listens on `127.0.0.1:3000`. Put a TLS-terminating reverse proxy in front, e.g. Caddy:

```caddyfile
app.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

EduAttend rejects state-changing requests whose `Origin` isn't the app's own, so `APP_URL` must be exactly the public address people use (scheme + host, e.g. `https://app.example.com`). One public hostname is supported per deployment.

## 3. Create the platform administrator

The demo seed has a known password — **never run `db:seed` in production.** Instead:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e SUPERADMIN_EMAIL=you@company.com -e SUPERADMIN_PASSWORD='a long passphrase 2026' \
  worker npm run platform:create-admin
```

Sign in at `/login`, open `/admin`. Schools sign up themselves at `/register` and start a trial; default plans are created automatically on a fresh database and can be edited under Platform → Plans.

## 4. Upgrades

```bash
git pull   # or fetch the new release
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` runs first; `web` and `worker` start only after it succeeds. Migrations are forward-only — take a backup first ([backups.md](backups.md)). `platform:sync` grants permissions introduced by the release to each school's built-in roles, without re-adding anything a school removed.

## 5. Checks after deploying

- `curl https://app.example.com/api/health` → `{"status":"ok","checks":{"database":"ok"},…}`
- Sign in as the platform admin; open a school's page under Platform → Organizations.
- Settings → Notifications → **Send a test message** (from any school admin) confirms email/WhatsApp/SMS delivery.
- The worker logs a `scheduler_tick` line every minute.

## Scaling notes

- `web` is stateless (sessions and rate limits live in Postgres): run several instances behind a load balancer, with `STORAGE_PROVIDER=s3`.
- Run **one** worker. Jobs are claimed atomically, so a second worker is harmless, but unnecessary.
- Postgres sizing: a 1,000-student school generates roughly 250k attendance rows a year; any managed Postgres works.

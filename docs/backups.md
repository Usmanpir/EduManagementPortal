# Backups and restores

Three things hold state. Back up all three; a backup you haven't restored isn't a backup.

| What | Where | How |
| --- | --- | --- |
| **Database** | Postgres (`pgdata` volume, or your managed DB) | `pg_dump` nightly + your provider's point-in-time recovery if available |
| **Uploaded files** | `storage` volume (`STORAGE_PROVIDER=local`) or your S3 bucket | Copy the volume, or enable bucket versioning/replication |
| **Secrets** | `.env.production` | Store `AUTH_SECRET` and especially `ENCRYPTION_KEY` in a password manager/secret store. Without `ENCRYPTION_KEY`, schools' saved WhatsApp/SMS credentials can't be decrypted (they'd need re-entering; nothing else is lost). |

## Nightly database backup (Docker Compose)

```bash
#!/usr/bin/env sh
# /etc/cron.daily/eduattend-backup — keeps 14 days locally; copy the folder off-site.
set -eu
cd /srv/eduattend
STAMP=$(date +%Y-%m-%d)
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U eduattend -d eduattend --format=custom --no-owner > "backups/db-$STAMP.dump"
docker run --rm -v eduattend_storage:/data -v "$PWD/backups:/out" alpine \
  tar czf "/out/storage-$STAMP.tgz" -C /data .
find backups -type f -mtime +14 -delete
```

Copy `backups/` to another machine or object store (e.g. `rclone sync backups remote:eduattend-backups`). Encrypt off-site copies — they contain student records.

## Restore

```bash
docker compose -f docker-compose.prod.yml stop web worker
# Database: replaces the current contents.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U eduattend -d eduattend --clean --if-exists --no-owner < backups/db-2026-10-01.dump
# Files.
docker run --rm -v eduattend_storage:/data -v "$PWD/backups:/in" alpine \
  sh -c "rm -rf /data/* && tar xzf /in/storage-2026-10-01.tgz -C /data"
docker compose -f docker-compose.prod.yml up -d
```

Then run the post-deploy checks in [deployment.md](deployment.md#5-checks-after-deploying). Restoring an older backup onto newer code is fine — `migrate` brings the schema forward on start.

## Restore drill (quarterly)

Restore the latest backup into a throwaway database (`createdb eduattend_drill`, `pg_restore -d eduattend_drill …`), point a local copy of the app at it, and sign in as a school admin. Record how long it took — that's your recovery time.

## One school's data

There is no per-school export in the product yet beyond the CSV/Excel reports and student export. To recover a single school from a backup, restore into a separate database and copy the needed rows by `organizationId`; every tenant table carries it.

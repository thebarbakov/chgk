# Deploy CHGK with Coolify

Use a Git-based Application with the Docker Compose build pack. Keep PostgreSQL
outside the application lifecycle so a redeploy never recreates the database.

## Application settings

- Repository: `https://github.com/thebarbakov/chgk`
- Branch: choose the reviewed release branch or `main` after merging it.
- Compose file: `/compose.coolify.yml`
- Enable source commit injection to record the revision in built image labels.
- Disable automatic deployment until the initial migration is verified.
- Enable connection to the predefined Docker network when the database uses it.

Enter the variables listed in the root `.env.example` through Coolify's
Environment Variables page. Never commit real credentials. `APP_ORIGIN` must
be the browser-facing origin, including `https://` and any nonstandard port.
Frontend public URLs are build-time values, so rebuild after changing the origin.

The gateway publishes on `127.0.0.1:8080` by default. When the existing reverse
proxy is on a different host, set `APP_BIND_IP` to the application's private
interface address. Point that proxy at the gateway and preserve the public Host,
X-Forwarded-Proto, and WebSocket upgrade headers. Do not publish PostgreSQL.

## Staging without production data

For standalone testing, use the additional isolated database definition:

```sh
docker compose --env-file .env.staging -f compose.coolify.yml -f deploy/compose.staging.yml up -d --build
```

Set `STAGING_DB_PASSWORD` and point `DATABASE_URL` at the `staging-db` service,
database/user `chgk_staging`. The empty database initializes from the existing
schema only on its first start. For an HTTP-only private preview, set
`APP_NODE_ENV=development` and `COOKIE_SECURE=false`. Production uses HTTPS and
`APP_NODE_ENV=production`.

## Production migration

1. Back up the current application files, PostgreSQL database, and uploads.
2. Verify frontend pages, `/health`, admin login, database access, upload download,
   and WebSocket connections against the isolated staging database.
3. Stop or freeze writes before the final data transfer. Match the production
   database schema and credentials; do not initialize an existing database.
4. Copy uploads into the application's named `uploads` volume. The Docker image
   makes both compiled upload paths resolve to that directory.
5. Deploy with the production origin and database, then switch the existing
   reverse proxy to the new gateway. Verify the same checks through public HTTPS.
6. Retain the old deployment until the new one is accepted. To recover, restore
   the previous proxy target and start the previous application, checking database
   compatibility before doing so.

New releases build from the branch/commit configured in Coolify. Use Deploy and
inspect deployment history to identify the exact revision. A code rollback does
not undo database changes. Compose services carry their own health checks and
do not provide application-level rolling replacement guarantees.

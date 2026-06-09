# Database (Supabase)

This project uses **Supabase managed PostgreSQL** for both local development and the cloud — there is no local Docker PostgreSQL. The original template path (Docker Compose Postgres) was replaced; see `PROJECT_CONTEXT.md` §2.

> Supabase runs **PostgreSQL 17**. The schema uses database-generated UUIDv7 defaults via `uuidv7()`, which is built into PG18 but **not** PG17 — so a pure-SQL `uuidv7()` function has been added to the database (see below). Keep this in mind before any major-version assumptions.

## Project

- Supabase project: `pnhd-zakup`, ref `wmwapduprqgjqffykkck`, region `eu-central-1` (Frankfurt).
- We use Supabase **only as managed Postgres** (Prisma + `pg` adapter, connecting as the `postgres` role). Supabase Auth, RLS, and Storage are **not** used — auth is the template's JWT. RLS is intentionally left off (the `postgres` role bypasses it anyway).

## Connect via the Session Pooler (not the direct host)

The direct host `db.<ref>.supabase.co` is **IPv6-only** and unreachable from most local networks (`No route to host`). Always use the **Session Pooler** (IPv4, port 5432):

```text
host: aws-1-eu-central-1.pooler.supabase.com
port: 5432
database: postgres
user: postgres.wmwapduprqgjqffykkck
sslmode: require
```

The session pooler (port 5432) — not the transaction pooler (6543) — is required because Prisma migrations need a session-scoped connection.

## One manual step: set the database password

The Supabase Management API does not expose the auto-generated DB password, and the `postgres` role password cannot be changed via SQL. Set it once in the dashboard:

1. Open **Project Settings → Database → Database password → Reset database password**.
2. Generate/copy the password.
3. Put it into `backend/.env` (next section). Never commit `backend/.env` — it is gitignored.

## backend/.env

```bash
# macOS, Linux, or Git Bash on Windows
cp backend/.env.example backend/.env
```

Then set the connection strings (replace `<PASSWORD>` with the password from the dashboard):

```text
DATABASE_URL="postgresql://postgres.wmwapduprqgjqffykkck:<PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&schema=public"
TEST_DATABASE_URL="postgresql://postgres.wmwapduprqgjqffykkck:<PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&schema=app_test"
TEST_SKIP_DOCKER="1"
TEST_ALLOW_NON_TEST_DATABASE="1"
```

`backend/src/db.ts` reads the `?schema=` param from the URL and passes it to the Prisma `pg` adapter, so the app schema (`public`) and the test schema (`app_test`) are isolated at runtime. `?sslmode=require` is normalized to libpq-compatible SSL automatically.

## Apply migrations

```bash
bun run --cwd backend prisma:deploy
```

Use `prisma:deploy` (migrate deploy) against the pooler. The `uuidv7()` helper must exist before the first migration — it is already created in the `public` and `app_test` schemas on this project. If you ever recreate the database, re-add it:

```sql
create or replace function public.uuidv7() returns uuid as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              placing substring(int8send((extract(epoch from clock_timestamp())*1000)::bigint) from 3)
              from 1 for 6),
      52, 1), 53, 1), 'hex')::uuid;
$$ language sql volatile;
```

## Tests

Tests use a separate schema **`app_test`** in the same Supabase database (Supabase always names the database `postgres`, so the template's name-based `*_test` guard is bypassed with `TEST_ALLOW_NON_TEST_DATABASE=1`; real isolation is the schema). With `TEST_SKIP_DOCKER=1` the integration runner skips Docker and targets `TEST_DATABASE_URL` directly:

```bash
bun run --cwd backend test            # unit + integration
bun run --cwd backend test:integration
```

Both flags live in `backend/.env`, so the commands work with no extra environment.

## Inspecting / resetting data

Use the Supabase dashboard (Table Editor / SQL Editor) or the Supabase MCP tools. To wipe the app schema for a clean start, truncate the tables in `public` (or drop/recreate the `app_test` schema for tests) — there are no local Docker volumes to delete.

## Upstream docs

- Supabase database & connection pooling: https://supabase.com/docs/guides/database/connecting-to-postgres
- Prisma + Supabase: https://supabase.com/docs/guides/database/prisma
- PostgreSQL docs: https://www.postgresql.org/docs/

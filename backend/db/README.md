# Database migrations

The schema is managed with [node-pg-migrate](https://salsita.github.io/node-pg-migrate/).
Migrations live in `backend/migrations/` and run in filename order. Applied
migrations are recorded in the `pgmigrations` table, so each runs once.

Run these from `backend/`. They connect with `DATABASE_URL` and, like the app,
load `backend/.env` if it exists. Check which database `DATABASE_URL` points
at before running them.

| Command | Purpose |
| --- | --- |
| `npm run migrate:up` | Apply all pending migrations |
| `npm run migrate:down` | Revert the most recent migration |
| `npm run migrate:create -- <name>` | Add a new SQL migration file |

## Changing the schema

1. `npm run migrate:create -- add-something` creates
   `migrations/<timestamp>_add-something.sql`.
2. Write the change under `-- Up Migration`, and how to undo it under
   `-- Down Migration`.
3. Run `npm run migrate:up` against a local database, then
   `npm run migrate:down` and `npm run migrate:up` again to check the undo step.

Never edit a migration that has run on a shared database; add a new one.
`schema.sql` is the baseline (`migrations/1795802143249_baseline.js` runs it),
so it must not be edited either.

## New database

`npm run migrate:up` creates the whole schema, including the plan and feature
flag seed rows.

## Existing database (created from schema.sql before migrations)

The baseline is already in place there, so mark it as applied instead of
running it:

1. Back up the database.
2. Check that it matches `schema.sql`, for example by comparing
   `pg_dump --schema-only` output with a fresh local database built by
   `npm run migrate:up -- 1`. Fix any differences first.
3. Mark only the baseline as applied:

   ```sh
   npm run migrate:up -- 1 --fake
   ```

   This records the baseline in `pgmigrations` without running it. Only do this
   on a database with no `pgmigrations` rows; on an empty database it would skip
   creating the schema.
4. Run `npm run migrate:up` to apply the later migrations.

The baseline cannot be reverted, because that would drop every table.

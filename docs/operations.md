# Operations

## Backend configuration

| Area | Variables |
| --- | --- |
| Server | `PORT`, `NODE_ENV`, `APP_BASE_URL`, `TRUST_PROXY`, `LOG_LEVEL` (an unknown level falls back to `info` with a warning), `SHUTDOWN_TIMEOUT_MS` (default 8000; keep it under Cloud Run's 10 s grace period) |
| Origin | `APP_BASE_URL` is the frontend's single origin with a scheme (for example `https://app.example.com`, or `http://localhost:5173` locally); a trailing slash or path is ignored. It is used for CORS and the Stripe redirect URLs. A malformed value or a list stops startup in production and only warns elsewhere |
| Proxy | `TRUST_PROXY` is required when `NODE_ENV=production`; startup fails if it is unset or malformed. Use a hop count (likely `2` for Firebase Hosting plus Cloud Run; confirm with `req.ip` after deploying), `true` (one hop), `false`, or comma-separated IPs/CIDRs or `loopback`/`linklocal`/`uniquelocal`. Defaults to `false` elsewhere |
| Sessions | `JWT_SECRET_KEY` (required to start) |
| Firebase | `FIREBASE_PROJECT_ID` (keyless), or `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PRIVATE_KEY_PATH` with `FIREBASE_PROJECT_ID` unset. `FIREBASE_PROJECT_ID` wins: the key variables are then ignored with a warning, and production refuses to start while both are set, or if Firebase Admin cannot start. Sign-in checks token revocation, so the credentials (keyless: the Cloud Run service account) need permission to read Firebase Auth users |
| Database | `DATABASE_URL`, or `PG_*` / `PG*` connection settings; `PG_SSL`, `DB_CA_CERT`. Pool: `PG_POOL_MAX` (10), `PG_CONNECTION_TIMEOUT_MS` (5000), `PG_IDLE_TIMEOUT_MS` (30000), `PG_STATEMENT_TIMEOUT_MS` (30000); a value that is not a positive integer stops startup. Migrations use `DATABASE_URL` only, so put SSL options in the URL |
| Redis | `REDIS_URL` (required in production). Commands time out after 1 s and connecting after 2 s; in production the limiter then answers 503, and requests briefly get 503 at startup until Redis connects. Development falls back to memory |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_CAREER_LAB_MODEL`, `OPENAI_REQUEST_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`, `OPENAI_RETRY_BASE_DELAY_MS` |
| AI limits | `MAX_AI_REQUESTS_PER_MINUTE` (30, per user), `MAX_AI_REQUESTS_PER_USER_PER_DAY` (default the smaller of 5 and the shared cap minus 1; must be below the shared cap), `MAX_GLOBAL_AI_REQUESTS_PER_DAY` (25, counted per real OpenAI call, retries included). All are whole numbers of at least 1, and `OPENAI_REQUEST_TIMEOUT_MS` too; `OPENAI_MAX_RETRIES` and `OPENAI_RETRY_BASE_DELAY_MS` may be 0. An invalid value stops startup |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_PRO_PRICE_ID` (or `STRIPE_PRICE_ID_PREMIUM`, `STRIPE_PRICE_ID_PRO`) |
| Admin | `ADMIN_FIREBASE_UIDS` (comma-separated) |
| Sentry | `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`. Only 5xx errors are reported; cookies, auth headers, query strings and bodies are removed first |
| Metrics | `METRICS_TOKEN`: `/metrics` needs `Authorization: Bearer <token>`. Unset, it answers 404 in production and is open elsewhere |

The frontend uses the `VITE_FIREBASE_*` variables listed in the project README.

## Commands

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm start` | Run the API |
| `backend` | `npm test` | node:test and Jest suites |
| `backend` | `npm run test:ci` | Module-boundary lint, then tests |
| `backend` | `npm run migrate:up` / `migrate:down` / `migrate:create <name>` | Apply, revert or create database migrations (see `backend/db/README.md`) |
| `frontend` | `npm run dev` / `npm run build` | Develop / build |
| `frontend` | `npm run lint` | ESLint |
| `frontend` | `npm test` / `npm run test:e2e` | Vitest / Playwright |

## Deployment

- **API:** `backend/Dockerfile` builds on Node 22 (`bookworm-slim`, pinned by digest), installs Chromium for Puppeteer, runs as the unprivileged `node` user with `tini` as init, and listens on port 8080. Tests, local SQL and docs are kept out of the image.
- **Database:** schema changes are migrations in `backend/migrations/` (`node-pg-migrate`). Run `npm run migrate:up` against the target database, for example as a Cloud Run Job on the same image. An existing database that already has the schema is marked with `npm run migrate:up -- 1 --fake` once; see `backend/db/README.md`.
- **Probes:** `GET /healthz` (liveness, no dependencies) and `GET /readyz` (runs `SELECT 1` with a 2 s limit; 503 on failure).
- **Shutdown:** on SIGTERM the API stops accepting connections, lets in-flight requests finish within `SHUTDOWN_TIMEOUT_MS`, then closes the pool, Redis and Sentry.
- **Frontend:** the local `firebase.json` serves `frontend/dist` from Firebase Hosting.
- **Routing:** it rewrites `/api/**` to the Cloud Run service `express-api` in `europe-west2`, and everything else to `index.html`.

`firebase.json` is gitignored, so a fresh clone does not include it. No CI workflow files are tracked.

## Observability

- Pino logs, with credentials and cookies redacted
- Prometheus metrics at `/metrics` (bearer token, see `METRICS_TOKEN`); request latency is in milliseconds
- Optional Sentry reporting (5xx only, scrubbed)
- Logs carry a `severity` field for Cloud Logging; 4xx log at warn, 5xx at error
- Feature flags `admin_dashboard`, `usage_analytics` and `audit_logs` are enforced (cached for 5 s). `audit_logs` is an on/off switch; a missing row or failed lookup still writes
- `usage_events` and `audit_logs` in PostgreSQL

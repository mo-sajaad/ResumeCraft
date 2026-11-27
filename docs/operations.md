# Operations

## Backend configuration

| Area | Variables |
| --- | --- |
| Server | `PORT`, `NODE_ENV`, `APP_BASE_URL`, `TRUST_PROXY`, `LOG_LEVEL` |
| Proxy | `TRUST_PROXY` is required when `NODE_ENV=production`; startup fails if it is unset or malformed. Use a hop count (likely `2` for Firebase Hosting plus Cloud Run; confirm with `req.ip` after deploying), `true` (one hop), `false`, or comma-separated IPs/CIDRs or `loopback`/`linklocal`/`uniquelocal`. Defaults to `false` elsewhere |
| Sessions | `JWT_SECRET_KEY` (required to start) |
| Firebase | `FIREBASE_PROJECT_ID` (keyless), or `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PRIVATE_KEY_PATH` with `FIREBASE_PROJECT_ID` unset. `FIREBASE_PROJECT_ID` wins: the key variables are then ignored with a warning, and production refuses to start while both are set, or if Firebase Admin cannot start. Sign-in checks token revocation, so the credentials (keyless: the Cloud Run service account) need permission to read Firebase Auth users |
| Database | `DATABASE_URL`, or `PG_*` / `PG*` connection settings; `PG_SSL`, `DB_CA_CERT` |
| Redis | `REDIS_URL` (required in production) |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_CAREER_LAB_MODEL`, `OPENAI_REQUEST_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`, `OPENAI_RETRY_BASE_DELAY_MS` |
| AI limits | `MAX_AI_REQUESTS_PER_MINUTE`, `MAX_GLOBAL_AI_REQUESTS_PER_DAY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_PRO_PRICE_ID` (or `STRIPE_PRICE_ID_PREMIUM`, `STRIPE_PRICE_ID_PRO`) |
| Admin | `ADMIN_FIREBASE_UIDS` (comma-separated) |
| Sentry | `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE` |

The frontend uses the `VITE_FIREBASE_*` variables listed in the project README.

## Commands

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm start` | Run the API |
| `backend` | `npm test` | node:test and Jest suites |
| `backend` | `npm run test:ci` | Module-boundary lint, then tests |
| `frontend` | `npm run dev` / `npm run build` | Develop / build |
| `frontend` | `npm run lint` | ESLint |
| `frontend` | `npm test` / `npm run test:e2e` | Vitest / Playwright |

## Deployment

- **API:** `backend/Dockerfile` builds on `node:20-slim`, installs Chromium for Puppeteer and listens on port 8080.
- **Frontend:** the local `firebase.json` serves `frontend/dist` from Firebase Hosting.
- **Routing:** it rewrites `/api/**` to the Cloud Run service `express-api` in `europe-west2`, and everything else to `index.html`.

`firebase.json` is gitignored, so a fresh clone does not include it. No CI workflow files are tracked.

## Observability

- Pino logs, with credentials and cookies redacted
- Prometheus metrics at `/metrics`
- Optional Sentry reporting
- `usage_events` and `audit_logs` in PostgreSQL

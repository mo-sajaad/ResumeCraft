# Backend

## Startup

`server.js` loads the environment, refuses to start without `JWT_SECRET_KEY`, initialises Sentry and starts the app. `app.js` exports `createApp()`, which assembles middleware in this order:

1. `helmet`, then CORS (only `APP_BASE_URL` is an allowed origin)
2. Sentry handlers, if enabled
3. Pino request logging, Prometheus metrics, usage analytics
4. `GET /metrics`
5. Stripe webhook router, mounted before JSON parsing because signature verification needs the raw body
6. `express.json()`
7. Domain module routers, all under `/api`
8. Error handlers

## Modules

Each module's `index.js` exposes a router that `app.js` mounts.

| Module | Mounted paths (under `/api`) | Responsibility |
| --- | --- | --- |
| `identity` | `/auth`, `/users` | Sessions, profiles, preferences |
| `billing` | `/billing`, `/stripe` | Checkout, customer portal, webhooks |
| `documents` | `/resumes`, `/cover-letters`, `/workspace` | Document CRUD, generation, editing, export |
| `career-intelligence` | `/ai`, `/career-tools` | AI generation endpoints and Career Lab tools |
| `admin` | `/admin`, `/feature-flags` | Flags, analytics, audit logs |

The code is **partway through a move from layer-based to module-based structure**:

- Repositories and Zod schemas live in `modules/`. So do the document services.
- Route files, and the controllers present in `modules/`, are one-line re-exports. The implementations are in the top-level `routes/` and `controllers/`.
- Other services remain in the top-level `services/` and call module repositories.
- `services/contracts.js` files contain JSDoc typedefs only.

`tests/moduleArchitecture.test.js` checks that each module has `controllers/`, `services/`, `repositories/`, `schemas/` and `routes/`; `.gitkeep` files hold empty ones. `eslint.config.cjs` configures restrictions on imports between modules.

## Layers

```text
modules/*/index.js → routes → middleware → controllers → services → repositories → config/db.js
```

There are exceptions: `middleware/authMiddleware.js`, `middleware/usageAnalytics.js` and `routes/stripeWebhookRoutes.js` query the database directly.

| Location | Contents |
| --- | --- |
| `controllers/careerTools/` | Career tools split into `coreTools`, `strategyTools`, `advancementTools`; shared `utils` and `aiEnhancement` |
| `services/ai/client.js` | OpenAI calls with timeout, retries and backoff |
| `services/aiService.js` | Resume, cover-letter and rewrite prompts |
| `services/subscriptionService.js` | Active plan, monthly limits, usage tracking |
| `templates/utils/pdfGenerator.js` | Fills HTML templates and renders PDFs with Puppeteer |
| `templates/{modern,corporate,creative}/` | Resume and cover-letter templates |

## Middleware

| Middleware | Purpose |
| --- | --- |
| `authMiddleware` | Verifies the JWT (bearer header or `__session` cookie) and token version; sets `req.user` |
| `attachPlan` | Loads the active subscription into `req.plan` |
| `requirePlan` | Enforces a minimum plan: free, premium, pro |
| `requireFeature` | Requires a plan capability such as `has_advanced_ai` |
| `requireTemplateAccess` | Restricts Free users to the Modern template |
| `enforceUsage` | Enforces monthly generation limits |
| `aiAbuseProtection` | Per-user and shared AI limits, input size guards |
| `rateLimiter` | Redis limiter with in-memory fallback outside production |
| `requireAdmin` | Checks `ADMIN_FIREBASE_UIDS` |
| `requireFeatureFlag` | Flag gate (not currently used) |
| `usageAnalytics` | Records authenticated requests in `usage_events` |
| `errorMiddleware` | Final error handler |

## Key flows

### Sign-in and sessions

1. The browser signs in with Firebase and posts the ID token to `POST /api/auth/exchange`.
2. The API verifies it and refuses it with 403 `EMAIL_NOT_VERIFIED` unless the email is verified. Otherwise it finds or creates the user and sets a seven-day HTTP-only `__session` JWT cookie.
3. Later requests compare the JWT's `tokenVersion` with the database. Logout increments that version, revoking all of the user's existing sessions.

### Resume generation

`POST /api/resumes/generate` runs:

```text
authenticateJWT → attachPlan → enforceUsage → requireTemplateAccess
→ aiRequestRateLimiter → payload and bullet guards → createResumeWithAI
```

The controller validates input, calls OpenAI, stores the result and records usage. Cover letters follow the same pattern, without the bullet guard.

### Career tools

There are 19 `POST /api/career-tools/*` endpoints. Each needs a minimum plan:

| Plan | Tools |
| --- | --- |
| Free | `job-parser`, `ats-analysis` |
| Pro | `recruiter-scan`, `competitive-analysis`, `salary-estimate`, `market-demand` |
| Premium | The remaining 13 |

`buildAiEnhancedResponse` takes a baseline response and asks OpenAI to improve it. If the key is missing, the call fails or the JSON is invalid, it returns the baseline with an `aiEnhancementStatus` explaining why.

### Billing

Checkout creates a Stripe subscription session. The webhook verifies the signature, records the event ID to skip duplicates, then handles `checkout.session.completed` and `customer.subscription.updated` / `.deleted`.

## Unreferenced code

No imports of these were found in the backend:

- `services/pdfService.js` (PDFs use `templates/utils/pdfGenerator.js`)
- `controllers/projectController.js`
- `config/openai.js`
- `middleware/requireFeatureFlag.js`
- `modules/career-intelligence/schemas/careerSchemas.js`

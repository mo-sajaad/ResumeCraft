# ResumeCraft AI

ResumeCraft AI is a career-document and job-search application for creating resumes and cover letters. It combines AI-assisted writing and document export with tools for analyzing job fit and planning a job search.

> **Note:** The live application is temporarily offline while I make security and reliability improvements. If you followed a link from one of my job applications, thank you for your interest. The full source code is available here, and you can run the project with the [local setup instructions](#local-setup).

![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_API-412991?style=for-the-badge&logo=openai&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe_API-635BFF?style=for-the-badge&logo=stripe&logoColor=white)

## Features

- Generate and edit AI-assisted resumes, and cover letters for a specific company and position.
- Preview documents using Modern, Corporate, and Creative templates.
- Export resumes and cover letters as PDFs.
- Use Career Lab tools for job-description parsing, ATS analysis, recruiter scans, competitive analysis, interview preparation, role fit, salary and market insights, and job-search planning.
- Sign in through Firebase Authentication; the backend exchanges Firebase ID tokens for an HTTP-only JWT session cookie.
- Subscribe through Stripe Checkout and manage billing through the Stripe customer portal.

## Tech Stack

| Area           | Technologies                                                                  |
| -------------- | ----------------------------------------------------------------------------- |
| Frontend       | React 19, Vite 7, React Router 7, CSS                                         |
| Backend        | Node.js, Express 5 (CommonJS)                                                 |
| Database       | PostgreSQL using `pg`                                                         |
| Rate limiting  | Redis in production; in-memory fallback for development                       |
| Authentication | Firebase Authentication and Firebase Admin, signed JWT cookie                 |
| AI             | OpenAI Chat Completions; resume and cover-letter generation use `gpt-4o-mini` |
| Billing        | Stripe subscriptions, Checkout, customer portal, and signed webhooks          |
| PDF generation | Puppeteer                                                                     |
| Observability  | Sentry, Pino, Prometheus metrics                                              |

The frontend does not use Next.js, Tailwind CSS, or shadcn/ui. No ORM or DOCX export library is present in the project dependencies.

## Architecture

```mermaid
flowchart LR
    Browser[React + Vite] -->|Firebase token exchange, then JWT cookie| API[Express API]
    API --> DB[(PostgreSQL)]
    API -->|AI requests| OpenAI[OpenAI API]
    API -->|Rate limiting| Redis[(Redis)]
    API -->|Checkout and billing portal| Stripe[Stripe]
    Stripe -->|Signed webhook| API
    API -->|Render PDF| PDF[Puppeteer]
```

PostgreSQL stores users, plans, subscriptions, AI usage, resumes, cover letters, and Stripe webhook events. New users are assigned the Free plan. Stripe webhook processing records event IDs to avoid processing duplicate deliveries and updates subscription entitlements in the database.

## Plans and Usage Limits

The backend seeds these plan limits in `backend/db/schema.sql`:

| Plan    | Monthly resume generations | Monthly cover-letter generations | Templates                   |
| ------- | -------------------------: | -------------------------------: | --------------------------- |
| Free    |                          1 |                                1 | Modern                      |
| Premium |                  Unlimited |                        Unlimited | Modern, Corporate, Creative |
| Pro     |                  Unlimited |                        Unlimited | Modern, Corporate, Creative |

Both paid plans are seeded with advanced AI and resume-analysis features. Resume and cover-letter PDF downloads require at least the Premium plan.

The AI endpoint limiter defaults to 30 requests per minute per user (or IP for unauthenticated requests) and can be changed with `MAX_AI_REQUESTS_PER_MINUTE`. A shared deployment-wide cutoff allows 25 AI requests in each fixed 24-hour window by default; configure it with `MAX_GLOBAL_AI_REQUESTS_PER_DAY`. This is a request-count cap, not a dollar-spend cap. Production counters use Redis; development can use in-memory limiters.

The database seeds, homepage and payment page all use $9.99/month for Premium and $19.99/month for Pro. Stripe charges the Price IDs configured in environment variables, so keep those in line with the displayed prices.

## API Overview

All routes are mounted under `/api`.

| Area           | Example routes                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | `POST /api/auth/exchange`, `POST /api/auth/logout`, `POST /api/auth/sessions/revoke`                                                      |
| Resumes        | `GET /api/resumes`, `POST /api/resumes/generate`, `GET /api/resumes/:id/preview`, `GET /api/resumes/:id/download`                         |
| Cover letters  | `GET /api/cover-letters`, `POST /api/cover-letters/generate`, `GET /api/cover-letters/:id/preview`, `GET /api/cover-letters/:id/download` |
| Career Lab     | `POST /api/career-tools/ats-analysis` (also job parser, recruiter scan, interview prep, role fit, and other tools)                        |
| Workspace      | `GET` or `PUT /api/workspace/document`, `POST /api/workspace/ai-rewrite`                                                                  |
| Billing        | `POST /api/billing/checkout-session`, `POST /api/billing/portal-session`                                                                  |
| Stripe webhook | `POST /api/stripe/webhook`                                                                                                                |

## Local Setup

### Prerequisites

- Node.js and npm
- PostgreSQL
- A Firebase project with Firebase Authentication enabled
- The Firebase project ID for the backend
- An OpenAI API key for AI features
- Redis for production (optional in local development)
- Stripe secret, webhook secret, and Price IDs to test subscription billing

There is no root `package.json` or Docker Compose file. Install and run the frontend and backend separately.

### 1. Configure the backend

Create `backend/.env` with the required values:

```dotenv
PORT=5000
JWT_SECRET_KEY=replace-with-a-long-random-secret
DATABASE_URL=postgresql://postgres:password@localhost:5432/resumecraft_db
OPENAI_API_KEY=replace-with-your-openai-key
FIREBASE_PROJECT_ID=your-firebase-project-id
APP_BASE_URL=http://localhost:5173
```

No service-account key is required: with only the Firebase project ID the API uses Application Default Credentials. Sign-in checks whether the Firebase user's tokens were revoked, so those credentials need permission to read Firebase Auth users (locally, for example, `gcloud auth application-default login` with an account that has access to the project; on Cloud Run, the service account). Without it, sign-in fails with a server error. To use a key anyway, set `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_PRIVATE_KEY_PATH`; these take precedence. Keep credentials private and out of version control.

Create a PostgreSQL database, then apply the schema from the repository root:

```bash
psql "postgresql://postgres:password@localhost:5432/resumecraft_db" -f backend/db/schema.sql
```

The schema creates the required tables, extensions, and seeded plans. Then install and start the backend:

```bash
cd backend
npm ci
npm start
```

For Stripe billing, also set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PREMIUM_PRICE_ID` / `STRIPE_PRO_PRICE_ID` (or their `STRIPE_PRICE_ID_PREMIUM` / `STRIPE_PRICE_ID_PRO` aliases). For Redis, set `REDIS_URL`. Set `NODE_ENV=production` in deployment. `TRUST_PROXY` is then required, and the API refuses to start if it is unset or malformed: use the number of proxy hops in front of the API (likely `2` for Firebase Hosting plus Cloud Run; confirm by checking `req.ip` after deploying), `true` (one hop), `false`, or a comma-separated list of IP addresses, CIDR ranges or `loopback`/`linklocal`/`uniquelocal`. Outside production it defaults to `false`. `OPENAI_CAREER_LAB_MODEL` can override the shared AI client’s default model; resume and cover-letter generation explicitly select `gpt-4o-mini`.

### 2. Configure and start the frontend

Create `frontend/.env` with the Firebase web-app configuration:

```dotenv
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api` requests to the backend at `http://localhost:5000`.

### Tests

Run backend tests from `backend/` with `npm test`. Run frontend unit tests from `frontend/` with `npm test`, or browser tests with `npm run test:e2e`.

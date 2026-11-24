# ResumeCraft

Two independent npm packages: `backend/` (Express 5, CommonJS, PostgreSQL via `pg`) and `frontend/` (React 19, Vite 7). There is no root `package.json`; run commands inside each package.

## Commands

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm start` | Run the API |
| `backend` | `npm test` | node:test (`*.test.js`) and Jest (`*.jest.js`) |
| `backend` | `npm run test:ci` | Module-boundary lint, then tests |
| `frontend` | `npm run dev` / `npm run build` | Develop / build |
| `frontend` | `npm run lint` | ESLint |
| `frontend` | `npm test` / `npm run test:e2e` | Vitest / Playwright |

## Structure

- Start with `docs/README.md`. If docs and code disagree, the code wins.
- Files in `backend/modules/*/routes/` and `backend/modules/*/controllers/` re-export the top-level `backend/routes/` and `backend/controllers/`. Edit the implementations there.
- Repositories, Zod schemas and document services live in `backend/modules/`.
- The Stripe webhook router must stay mounted before `express.json()`; it needs the raw body.
- Career tool plan tiers are defined in both `backend/routes/careerToolsRoutes.js` and `frontend/src/pages/dashboard/career-lab/careerLabTools.js`. Change them together.

## Section work

The code is split into seven sections with one owner per file. The section files under `docs/agents/` and `docs/sections/` are kept locally and are not in the repository; if they are missing, skip these rules. When assigned a section:

- Follow `docs/agents/README.md` and that section's brief in `docs/agents/`.
- Check `docs/agents/ownership.md` before editing. Report problems in other sections rather than fixing them.
- Add new files to `docs/agents/ownership.md`.
- During the audit round, write only to `docs/sections/<section>/`.

## Safety

- Never print, copy or commit secrets (`.env`, `env.yaml`, service-account JSON).
- Use local or test services only. Do not call production or paid APIs without approval.
- Do not commit or push unless asked.

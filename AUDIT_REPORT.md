# Autonomous CTO SaaS Audit Report

## Running Audit Log

- Batch 01 reviewed (10 files): frontend/vite.config.js, frontend/public/vite.svg ...
- Batch 02 reviewed (10 files): frontend/src/App.css, frontend/src/assets/react.svg ...
- Batch 03 reviewed (10 files): frontend/src/pages/Home.css, frontend/src/pages/Home.jsx ...
- Batch 04 reviewed (10 files): frontend/src/pages/dashboard/ResumeNew.jsx, frontend/src/pages/dashboard/CareerLab.jsx ...
- Batch 05 reviewed (10 files): frontend/src/layouts/DashboardLayout.jsx, frontend/src/layouts/DashboardLayout.css ...
- Batch 06 reviewed (10 files): backend/controllers/careerToolsController.js, backend/controllers/careerTools/utils.js ...
- Batch 07 reviewed (10 files): backend/services/pdfService.js, backend/services/userService.js ...
- Batch 08 reviewed (10 files): frontend/src/components/ui/LoadingState.jsx, frontend/src/components/ui/EmptyState.jsx ...
- Batch 09 reviewed (10 files): backend/templates/modern/resume/template.html, frontend/src/components/Resume/ResumePages.css ...
- Batch 10 reviewed (10 files): backend/templates/modern/cover-letter/styles.css, backend/templates/modern/cover-letter/template.html ...
- Batch 11 reviewed (10 files): backend/templates/utils/pdfGenerator.js, backend/templates/corporate/resume/styles.css ...
- Batch 12 reviewed (10 files): backend/routes/coverLetterRoutes.js, backend/routes/careerToolsRoutes.js ...
- Batch 13 reviewed (1 files): backend/tests/careerToolsController.test.js

## Reviewed Files Checklist

- [x] `frontend/vite.config.js`
- [x] `frontend/public/vite.svg`
- [x] `frontend/README.md`
- [x] `frontend/package.json`
- [x] `frontend/tests/careerLab.test.js`
- [x] `frontend/index.html`
- [x] `frontend/src/constants/routes.js`
- [x] `frontend/src/context/AuthContext.jsx`
- [x] `frontend/src/context/AuthProvider.jsx`
- [x] `frontend/src/context/useAuth.js`
- [x] `frontend/src/App.css`
- [x] `frontend/src/assets/react.svg`
- [x] `frontend/src/utils/validators.js`
- [x] `frontend/src/utils/auth.js`
- [x] `frontend/src/main.jsx`
- [x] `frontend/src/App.jsx`
- [x] `frontend/src/routes/ProtectedRoute.jsx`
- [x] `frontend/src/routes/RedirectIfAuth.jsx`
- [x] `frontend/src/pages/Settings.jsx`
- [x] `frontend/src/pages/Payment.jsx`
- [x] `frontend/src/pages/Home.css`
- [x] `frontend/src/pages/Home.jsx`
- [x] `frontend/src/pages/ErrorPage.jsx`
- [x] `frontend/src/pages/auth/Signup.jsx`
- [x] `frontend/src/pages/auth/Login.jsx`
- [x] `frontend/src/pages/dashboard/DocumentWorkspace.jsx`
- [x] `frontend/src/pages/dashboard/DashboardShared.css`
- [x] `frontend/src/pages/dashboard/DocumentWorkspace.css`
- [x] `frontend/src/pages/dashboard/CoverLetterNew.jsx`
- [x] `frontend/src/pages/dashboard/DashboardHome.jsx`
- [x] `frontend/src/pages/dashboard/ResumeNew.jsx`
- [x] `frontend/src/pages/dashboard/CareerLab.jsx`
- [x] `frontend/src/pages/dashboard/career-lab/CareerLabToolPage.jsx`
- [x] `frontend/src/pages/dashboard/career-lab/CareerLabLayout.jsx`
- [x] `frontend/src/pages/dashboard/career-lab/careerLabTools.js`
- [x] `frontend/src/pages/dashboard/career-lab/CareerLabOverview.jsx`
- [x] `frontend/src/pages/dashboard/CareerLab.css`
- [x] `frontend/src/layouts/RootLayout.jsx`
- [x] `frontend/src/layouts/AuthLayout.css`
- [x] `frontend/src/layouts/AuthLayout.jsx`
- [x] `frontend/src/layouts/DashboardLayout.jsx`
- [x] `frontend/src/layouts/DashboardLayout.css`
- [x] `frontend/src/firebase.js`
- [x] `frontend/src/styles/design-system.css`
- [x] `frontend/eslint.config.js`
- [x] `frontend/package-lock.json`
- [x] `frontend/src/hooks/useListManager.js`
- [x] `frontend/src/router.jsx`
- [x] `backend/controllers/coverLetterController.js`
- [x] `backend/controllers/userController.js`
- [x] `backend/controllers/careerToolsController.js`
- [x] `backend/controllers/careerTools/utils.js`
- [x] `backend/controllers/careerTools/coreTools.js`
- [x] `backend/controllers/careerTools/strategyTools.js`
- [x] `backend/controllers/careerTools/advancementTools.js`
- [x] `backend/controllers/workspaceController.js`
- [x] `backend/controllers/authController.js`
- [x] `backend/controllers/resumeController.js`
- [x] `backend/controllers/projectController.js`
- [x] `backend/controllers/aiController.js`
- [x] `backend/services/pdfService.js`
- [x] `backend/services/userService.js`
- [x] `backend/services/aiService.js`
- [x] `backend/services/subscriptionService.js`
- [x] `backend/firebaseAdmin.js`
- [x] `backend/firebase-service-account.json`
- [x] `backend/server.js`
- [x] `backend/templates/creative/resume/styles.css`
- [x] `frontend/src/components/ui/PageHeader.jsx`
- [x] `backend/templates/creative/resume/template.html`
- [x] `frontend/src/components/ui/LoadingState.jsx`
- [x] `frontend/src/components/ui/EmptyState.jsx`
- [x] `backend/templates/creative/cover-letter/styles.css`
- [x] `frontend/src/components/ui/SectionCard.jsx`
- [x] `backend/templates/creative/cover-letter/template.html`
- [x] `frontend/src/components/ui/Breadcrumbs.jsx`
- [x] `frontend/src/components/ui/ui.css`
- [x] `frontend/src/components/ui/BrandedLoader.jsx`
- [x] `frontend/src/components/ui/Button.jsx`
- [x] `backend/templates/modern/resume/styles.css`
- [x] `backend/templates/modern/resume/template.html`
- [x] `frontend/src/components/Resume/ResumePages.css`
- [x] `frontend/src/components/Resume/SkillsCard.jsx`
- [x] `frontend/src/components/Resume/ExperienceCard.jsx`
- [x] `frontend/src/components/Resume/DeleteModal.jsx`
- [x] `frontend/src/components/Resume/PersonalInfoCard.jsx`
- [x] `frontend/src/components/Resume/ATSCard.jsx`
- [x] `frontend/src/components/Resume/EducationCard.jsx`
- [x] `frontend/src/components/Resume/ProjectsCard.jsx`
- [x] `frontend/src/index.css`
- [x] `backend/templates/modern/cover-letter/styles.css`
- [x] `backend/templates/modern/cover-letter/template.html`
- [x] `backend/middleware/errorMiddleware.js`
- [x] `backend/middleware/requirePlan.js`
- [x] `backend/middleware/attachPlan.js`
- [x] `backend/middleware/authMiddleware.js`
- [x] `backend/middleware/enforceUsage.js`
- [x] `backend/middleware/requireFeature.js`
- [x] `backend/middleware/rateLimiter.js`
- [x] `backend/middleware/requireTemplateAccess.js`
- [x] `backend/templates/utils/pdfGenerator.js`
- [x] `backend/templates/corporate/resume/styles.css`
- [x] `backend/templates/corporate/resume/template.html`
- [x] `backend/templates/corporate/cover-letter/styles.css`
- [x] `backend/templates/corporate/cover-letter/template.html`
- [x] `backend/db/schema.sql`
- [x] `backend/routes/billingRoutes.js`
- [x] `backend/routes/aiRoutes.js`
- [x] `backend/routes/authRoutes.js`
- [x] `backend/routes/resumeRoutes.js`
- [x] `backend/routes/coverLetterRoutes.js`
- [x] `backend/routes/careerToolsRoutes.js`
- [x] `backend/routes/stripeWebhookRoutes.js`
- [x] `backend/routes/workspaceRoutes.js`
- [x] `backend/routes/userRoutes.js`
- [x] `backend/package.json`
- [x] `backend/config/stripe.js`
- [x] `backend/config/openai.js`
- [x] `backend/config/db.js`
- [x] `backend/package-lock.json`
- [x] `backend/tests/careerToolsController.test.js`

## 1. Architecture Review

- **Frontend:** React + Vite SPA with React Router lazy routes and Firebase Auth client integration.
- **Backend:** Node.js + Express REST API with JWT auth middleware and PostgreSQL data layer.
- **Database:** PostgreSQL schema defined in `backend/db/schema.sql` with usage quotas/plans/subscriptions.
- **Auth:** Firebase Authentication (client) + backend token exchange issuing app JWTs.
- **Billing:** Stripe checkout + webhook reconciliation updates subscriptions.
- **AI integrations:** OpenAI in career tools and generation endpoints.
- **Templates/PDF:** HTML/CSS templates rendered and converted to PDF in backend services.
- **Testing:** Node test runner in frontend and backend focused tests.

**Architecture risks**

- In-memory rate limiting was missing (now added) and would previously allow unlimited auth exchange attempts.
- Firebase Admin fallback to a local tracked service-account file was unsafe (now removed).
- Some controllers still combine orchestration, prompting, validation, and persistence in single modules (high coupling).

## 2. Page-by-Page Analysis

- **Home/Auth pages:** Good route split; add richer validation and auth error messaging consistency.
- **Dashboard home:** Improved state UX and actions menu; remaining gap is keyboard navigation inside action dropdown and toast notifications.
- **Resume/Cover Letter editors:** Feature-rich but large components; extract shared form sections and API hooks to reduce drift.
- **Career Lab:** Nested tools map is clean; ensure each tool has explicit loading/error/empty copy and analytics events.
- **Payment/Settings:** Present but can improve plan-change feedback, proration explanation, and account security controls.

## 3. Component Audit

- Shared UI primitives now exist; next step is replacing legacy `.btn` and duplicated card styles gradually.
- Several dashboard page components are still monolithic (>200 lines); recommend splitting view + data hooks.
- Accessibility: focus-visible present globally, but dropdown/menu keyboard arrow navigation is still limited.

## 4. Backend/API Review

- Auth middleware correctly validates JWT and maps to app user.
- Stripe webhook uses raw body and transactional updates for checkout completion (good).
- Added explicit auth exchange rate limiting middleware to reduce brute-force token exchange abuse.
- Recommendation: central input validation middleware for all write endpoints using `express-validator` schemas.

## 5. Database Audit

- Core relational model is appropriate for SaaS plans/usage/documents.
- Verify indexes for frequent filters (`user_id`, `updated_at`, `stripe_subscription_id`) and add composite indexes where query plans show scans.
- Add migration tooling and repeatable migration scripts; schema currently appears static/manual.

## 6. Security Report

- **High:** Firebase Admin credential fallback to repository file. Fixed by requiring env-provided credential JSON/path.
- **Medium:** Missing auth endpoint throttling. Fixed with in-memory rate limiter on `/api/auth/exchange`.
- **Medium:** No explicit CSRF strategy noted for cookie-based auth (currently bearer-token localStorage approach has XSS sensitivity tradeoff).
- **Low:** Ensure production CORS policy restricts origins instead of permissive defaults.

## 7. Performance Improvements

- Frontend: continue route-level code splitting and consider splitting heavy dashboard editors further.
- Backend: add response caching for read-heavy profile/doc lists (short TTL) and OpenAI request dedupe for repeated prompts.
- Infrastructure: consider CDN for static assets and DB connection pooling tuning by environment.

## 8. SaaS Product Improvements

- Add first-run onboarding checklist (create first resume, run ATS scan, upgrade prompt).
- Instrument funnel analytics: signup -> first document -> first download -> upgrade click -> checkout success.
- Add contextual upsell surfaces in feature-locked actions with benefit-oriented copy.

## 9. Developer Experience Improvements

- Add backend lint/test scripts with CI gates to enforce consistency.
- Add OpenAPI or typed API contract generation to reduce frontend/backend drift.
- Expand tests for auth exchange, delete document flows, and webhook edge cases.

## 10. GitHub Issues

1. **Harden Firebase Admin credential loading**  
   - Severity: High  
   - Location: `backend/firebaseAdmin.js`  
   - Suggested solution: Repository fallback credential path risk; require env-based credentials only.
2. **Add API rate limiting on auth exchange**  
   - Severity: Medium  
   - Location: `backend/routes/authRoutes.js, backend/middleware/rateLimiter.js`  
   - Suggested solution: Throttle token exchange attempts to reduce abuse.
3. **Add centralized request validation schemas**  
   - Severity: Medium  
   - Location: `backend/routes/*, backend/controllers/*`  
   - Suggested solution: Normalize validation and consistent 4xx responses.
4. **Improve dashboard action-menu keyboard UX**  
   - Severity: Medium  
   - Location: `frontend/src/pages/dashboard/DashboardHome.jsx`  
   - Suggested solution: Add arrow/escape key handling and focus management.
5. **Introduce backend CI pipeline**  
   - Severity: High  
   - Location: `.github/workflows/* (missing)`  
   - Suggested solution: Run lint/tests/security scans on each PR.
6. **Implement migration toolchain**  
   - Severity: Medium  
   - Location: `backend/db/schema.sql`  
   - Suggested solution: Adopt versioned migrations for safe schema evolution.

## 11. Prioritized Engineering Roadmap

### CRITICAL
- Secrets management hardening (done in this patch) and rotate any previously committed credentials.
- Add CI with security scanning + test enforcement.
### HIGH IMPACT
- Validation middleware standardization across write endpoints.
- Dashboard/editor component decomposition and performance pass.
### MEDIUM
- Product analytics instrumentation and onboarding checklist.
- Database index review with EXPLAIN ANALYZE-driven tuning.
### LOW
- CSS cleanup of legacy class duplication and minor copy/visual polish.
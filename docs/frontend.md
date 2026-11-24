# Frontend

## Startup

`src/main.jsx` renders `AuthProvider` around the router from `src/router.jsx`. Pages are lazy-loaded behind a `BrandedLoader` fallback.

## Source layout

| Path under `src/` | Contents |
| --- | --- |
| `router.jsx`, `constants/routes.js` | Route tree and path constants |
| `pages/` | Route-level screens |
| `layouts/` | Auth and dashboard shells |
| `routes/` | `ProtectedRoute` and `RedirectIfAuth` guards |
| `context/` | `AuthContext`, `AuthProvider`, `useAuth` |
| `components/Resume/` | Resume form cards |
| `components/ui/` | Shared UI components |
| `hooks/` | `useListManager` |
| `utils/` | Authenticated fetch helpers and validators |
| `firebase.js` | Firebase client setup |
| `styles/`, `index.css` | Design-system and global CSS |

## Routes

| Path | Page |
| --- | --- |
| `/` | `Home` |
| `/auth/login`, `/auth/signup` | `Login`, `Signup` |
| `/dashboard` | `DashboardHome` |
| `/dashboard/resume/new` | `ResumeNew` |
| `/dashboard/cover-letter/new` | `CoverLetterNew` |
| `/dashboard/editor` | `DocumentWorkspace` |
| `/dashboard/payment` | `Payment` |
| `/dashboard/settings` | `Settings` |
| `/dashboard/admin` | `AdminDashboard` |
| `/dashboard/career-lab` | `CareerLabOverview` |
| `/dashboard/career-lab/tools/:toolId` | `CareerLabToolPage` |

All dashboard routes require sign-in. The API enforces admin access.

## Authentication and API calls

Firebase owns the browser's sign-in state. `AuthProvider` listens for changes, exchanges the ID token for a session cookie and loads the user profile.

`utils/auth.js` provides `authFetch`, which sends the cookie and, on a 401, renews the session and retries once. Some pages use it; others call `fetch` directly. In development, Vite proxies `/api` to `http://localhost:5000`.

## Career Lab

`pages/dashboard/career-lab/careerLabTools.js` defines each tool's category, minimum plan, fields, endpoint and payload. `CareerLabToolPage` serves them through one dynamic route. A new tool needs an entry here and a matching backend route; keep the plan requirement the same in both.

## Unreferenced code

- `App.jsx` (the Vite starter) and `layouts/RootLayout.jsx`
- `pages/dashboard/CareerLab.jsx`, a re-export the router does not use
- `axios`, `bcryptjs`, `jsonwebtoken` and `express-validator` are dependencies with no imports found in `src/`

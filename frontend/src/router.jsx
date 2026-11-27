import { createBrowserRouter, Navigate } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import RedirectIfAuth from "./routes/RedirectIfAuth.jsx";
import RootLayout from "./routes/RootLayout.jsx";

import ErrorPage from "./pages/ErrorPage.jsx";
import NotFound from "./pages/NotFound.jsx";
import BrandedLoader from "./components/ui/BrandedLoader.jsx";
import { TOOL_MAP } from "./pages/dashboard/career-lab/careerLabTools.js";

// Lazy-loaded pages. Route `lazy` loads the code before the navigation
// commits, so the old page stays with a pending indicator meanwhile and a
// failed chunk reaches the route's error boundary (SHELL-007, SHELL-003).
const page = (load) => async () => ({ Component: (await load()).default });

const Home = page(() => import("./pages/Home.jsx"));
const Login = page(() => import("./pages/auth/Login.jsx"));
const Signup = page(() => import("./pages/auth/Signup.jsx"));
const DashboardHome = page(() => import("./pages/dashboard/DashboardHome.jsx"));
const ResumeNew = page(() => import("./pages/dashboard/ResumeNew.jsx"));
const CoverLetterNew = page(() => import("./pages/dashboard/CoverLetterNew.jsx"));
const DocumentWorkspace = page(() => import("./pages/dashboard/DocumentWorkspace.jsx"));
const Payment = page(() => import("./pages/Payment.jsx"));
const Settings = page(() => import("./pages/Settings.jsx"));
const AdminDashboard = page(() => import("./pages/AdminDashboard.jsx"));
const CareerLabLayout = page(() => import("./pages/dashboard/career-lab/CareerLabLayout.jsx"));
const CareerLabOverview = page(() => import("./pages/dashboard/career-lab/CareerLabOverview.jsx"));
const CareerLabToolPage = page(() => import("./pages/dashboard/career-lab/CareerLabToolPage.jsx"));

// Document titles (SHELL-007); RootLayout uses the deepest one.
const title = (value) => ({ title: value });
const toolTitle = ({ params }) =>
  Object.hasOwn(TOOL_MAP, params.toolId) ? TOOL_MAP[params.toolId].title : null;

export const router = createBrowserRouter([
  {
    // Outermost error boundary: catches anything a page or layout throws (SHELL-003).
    element: <RootLayout />,
    errorElement: <ErrorPage fullPage />,
    // Shown while the first page's code loads.
    hydrateFallbackElement: <BrandedLoader message="Loading..." />,
    children: [
      // Home page
      { path: "/", lazy: Home },

      // Auth routes
      {
        path: "auth",
        element: <AuthLayout />, // wraps auth pages
        children: [
          {
            // Errors show inside the auth layout, which keeps its links.
            errorElement: <ErrorPage />,
            children: [
              // /auth on its own has no page (SHELL-019).
              { index: true, element: <Navigate to="login" replace /> },
              {
                element: <RedirectIfAuth />, // wrapper for login/signup
                children: [
                  { path: "login", lazy: Login, handle: title("Sign in") },
                  { path: "signup", lazy: Signup, handle: title("Create account") },
                ],
              },
            ],
          },
        ],
      },

      // Dashboard routes. The guard comes first, so the shell never shows without
      // a signed-in user and a loaded profile (SHELL-012).
      {
        path: "dashboard",
        element: <ProtectedRoute />, // requires login
        children: [
          {
            element: <DashboardLayout />, // wraps dashboard pages
            children: [
              {
                // Errors show inside the shell, so the sidebar still works.
                errorElement: <ErrorPage />,
                handle: title("Dashboard"),
                children: [
                  { index: true, lazy: DashboardHome },
                  { path: "resume/new", lazy: ResumeNew, handle: title("New resume") },
                  { path: "cover-letter/new", lazy: CoverLetterNew, handle: title("New cover letter") },
                  { path: "editor", lazy: DocumentWorkspace, handle: title("Document workspace") },
                  { path: "payment", lazy: Payment, handle: title("Plans") },
                  { path: "settings", lazy: Settings, handle: title("Settings") },
                  { path: "admin", lazy: AdminDashboard, handle: title("Admin") },
                  { path: "career-lab", lazy: CareerLabLayout, handle: title("Career Lab"), children: [
                    { index: true, lazy: CareerLabOverview },
                    { path: "tools/:toolId", lazy: CareerLabToolPage, handle: { title: toolTitle } }
                  ] },
                  // Unknown dashboard URLs stay in the shell (SHELL-019).
                  { path: "*", element: <NotFound />, handle: title("Page not found") },
                ],
              },
            ],
          },
        ],
      },

      // Any other URL (SHELL-019).
      { path: "*", element: <NotFound fullPage />, handle: title("Page not found") },
    ],
  },
]);

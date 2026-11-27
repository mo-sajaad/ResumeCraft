import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";

import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import RedirectIfAuth from "./routes/RedirectIfAuth.jsx";

import ErrorPage from "./pages/ErrorPage.jsx";
import NotFound from "./pages/NotFound.jsx";
import BrandedLoader from "./components/ui/BrandedLoader.jsx";

// Lazy-loaded pages
const Home = lazy(() => import("./pages/Home.jsx"));
const Login = lazy(() => import("./pages/auth/Login.jsx"));
const Signup = lazy(() => import("./pages/auth/Signup.jsx"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome.jsx"));
const ResumeNew = lazy(() => import("./pages/dashboard/ResumeNew.jsx"));
const CoverLetterNew = lazy(() => import("./pages/dashboard/CoverLetterNew.jsx"));
const DocumentWorkspace = lazy(() => import("./pages/dashboard/DocumentWorkspace.jsx"));
const Payment = lazy(() => import("./pages/Payment.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const CareerLabLayout = lazy(() => import("./pages/dashboard/career-lab/CareerLabLayout.jsx"));
const CareerLabOverview = lazy(() => import("./pages/dashboard/career-lab/CareerLabOverview.jsx"));
const CareerLabToolPage = lazy(() => import("./pages/dashboard/career-lab/CareerLabToolPage.jsx"));

// Suspense wrapper
const withSuspense = (element) => (
  <Suspense fallback={<BrandedLoader />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  {
    // Outermost error boundary: catches anything a page or layout throws (SHELL-003).
    errorElement: <ErrorPage fullPage />,
    children: [
      // Home page
      { path: "/", element: withSuspense(<Home />) },

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
                  { path: "login", element: withSuspense(<Login />) },
                  { path: "signup", element: withSuspense(<Signup />) },
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
                children: [
                  { index: true, element: withSuspense(<DashboardHome />) },
                  { path: "resume/new", element: withSuspense(<ResumeNew />) },
                  { path: "cover-letter/new", element: withSuspense(<CoverLetterNew />) },
                  { path: "editor", element: withSuspense(<DocumentWorkspace />) },
                  { path: "payment", element: withSuspense(<Payment />) },
                  { path: "settings", element: withSuspense(<Settings />) },
                  { path: "admin", element: withSuspense(<AdminDashboard />) },
                  { path: "career-lab", element: withSuspense(<CareerLabLayout />), children: [
                    { index: true, element: withSuspense(<CareerLabOverview />) },
                    { path: "tools/:toolId", element: withSuspense(<CareerLabToolPage />) }
                  ] },
                  // Unknown dashboard URLs stay in the shell (SHELL-019).
                  { path: "*", element: <NotFound /> },
                ],
              },
            ],
          },
        ],
      },

      // Any other URL (SHELL-019).
      { path: "*", element: <NotFound fullPage /> },
    ],
  },
]);

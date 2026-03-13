import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";

import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import RedirectIfAuth from "./routes/RedirectIfAuth.jsx";

import ErrorPage from "./pages/ErrorPage.jsx";

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
const CareerLabLayout = lazy(() => import("./pages/dashboard/career-lab/CareerLabLayout.jsx"));
const CareerLabOverview = lazy(() => import("./pages/dashboard/career-lab/CareerLabOverview.jsx"));
const CareerLabToolPage = lazy(() => import("./pages/dashboard/career-lab/CareerLabToolPage.jsx"));

// Suspense wrapper
const withSuspense = (element) => (
  <Suspense fallback={<div>Loading...</div>}>{element}</Suspense>
);

export const router = createBrowserRouter([
  // Home page
  { path: "/", element: withSuspense(<Home />), errorElement: <ErrorPage /> },

  // Auth routes
  {
    path: "auth",
    element: <AuthLayout />, // wraps auth pages
    children: [
      {
        element: <RedirectIfAuth />, // wrapper for login/signup
        children: [
          { path: "login", element: withSuspense(<Login />) },
          { path: "signup", element: withSuspense(<Signup />) },
        ],
      },
    ],
  },

  // Dashboard routes
  {
    path: "dashboard",
    element: <DashboardLayout />, // wraps dashboard pages
    children: [
      {
        element: <ProtectedRoute />, // requires login
        children: [
          { index: true, element: withSuspense(<DashboardHome />) },
          { path: "resume/new", element: withSuspense(<ResumeNew />) },
          { path: "cover-letter/new", element: withSuspense(<CoverLetterNew />) },
          { path: "editor", element: withSuspense(<DocumentWorkspace />) },
          { path: "payment", element: withSuspense(<Payment />) },
          { path: "settings", element: withSuspense(<Settings />) },
          { path: "career-lab", element: withSuspense(<CareerLabLayout />), children: [
            { index: true, element: withSuspense(<CareerLabOverview />) },
            { path: "tools/:toolId", element: withSuspense(<CareerLabToolPage />) }
          ] }
        ],
      },
    ],
  },
]);

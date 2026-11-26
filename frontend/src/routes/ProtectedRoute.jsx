import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes.js";
import BrandedLoader from "../components/ui/BrandedLoader.jsx";
import SessionError from "./SessionError.jsx";

export default function ProtectedRoute() {
  const { user, loading, needsEmailVerification, sessionStatus } = useAuth();
  const location = useLocation();

  if (loading) return <BrandedLoader message="Checking your session..." />;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;

  // The sign-in pages show the check-your-email page to this user.
  if (needsEmailVerification) return <Navigate to={ROUTES.LOGIN} replace />;

  // The app opens only with a session and a profile (IDENTITY-009).
  if (sessionStatus === "error") return <SessionError />;
  if (sessionStatus !== "ready") return <BrandedLoader message="Loading your account..." />;

  return <Outlet />;
}

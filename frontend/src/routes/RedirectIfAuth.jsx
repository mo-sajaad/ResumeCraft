import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes.js";
import VerifyEmail from "../pages/auth/VerifyEmail.jsx";
import BrandedLoader from "../components/ui/BrandedLoader.jsx";
import SessionError from "./SessionError.jsx";

// The page ProtectedRoute saved, if it is a path inside this app (IDENTITY-021).
function savedDestination(from) {
  const path = `${from?.pathname || ""}${from?.search || ""}${from?.hash || ""}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return ROUTES.DASHBOARD;
  if (path.startsWith("/auth")) return ROUTES.DASHBOARD;
  return path;
}

export default function RedirectIfAuth() {
  const { user, loading, authError, needsEmailVerification, sessionStatus } = useAuth();
  const location = useLocation();

  if (loading) return <BrandedLoader message="Loading authentication..." />;
  if (user && needsEmailVerification) return <VerifyEmail key={user.uid} />;
  // Only a working session leaves the sign-in pages, so a failed one is
  // explained here instead of on a broken dashboard (IDENTITY-009).
  if (user && sessionStatus === "ready") return <Navigate to={savedDestination(location.state?.from)} replace />;
  if (user && sessionStatus === "error") return <SessionError />;
  // Just signed in: the provider is getting the session (IDENTITY-014).
  if (user && sessionStatus === "loading") return <BrandedLoader message="Signing you in..." />;

  return (
    <>
      {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
      <Outlet />
    </>
  );
}

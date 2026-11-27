import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes.js";
import VerifyEmail from "../pages/auth/VerifyEmail.jsx";
import BrandedLoader from "../components/ui/BrandedLoader.jsx";
import SessionError from "./SessionError.jsx";

export default function RedirectIfAuth() {
  const { user, loading, authError, needsEmailVerification, sessionStatus } = useAuth();

  if (loading) return <BrandedLoader message="Loading authentication..." />;
  if (user && needsEmailVerification) return <VerifyEmail key={user.uid} />;
  // Only a working session leaves the sign-in pages, so a failed one is
  // explained here instead of on a broken dashboard (IDENTITY-009).
  if (user && sessionStatus === "ready") return <Navigate to={ROUTES.DASHBOARD} replace />;
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

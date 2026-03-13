import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes.js";
import BrandedLoader from "../components/ui/BrandedLoader.jsx";

export default function RedirectIfAuth() {
  const { user, loading } = useAuth();

  if (loading) return <BrandedLoader message="Loading authentication..." />;
  if (user) return <Navigate to={ROUTES.DASHBOARD} replace />;

  return <Outlet />;
}

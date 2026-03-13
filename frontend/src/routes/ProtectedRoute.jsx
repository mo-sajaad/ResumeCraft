import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes.js";
import BrandedLoader from "../components/ui/BrandedLoader.jsx";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BrandedLoader message="Checking your session..." />;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;

  return <Outlet />;
}

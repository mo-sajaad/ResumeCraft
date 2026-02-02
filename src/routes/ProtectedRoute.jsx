import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>; // show something while auth state loads

  if (!user) return <Navigate to="/auth/login" replace />;

  return <Outlet />; // render child routes
}

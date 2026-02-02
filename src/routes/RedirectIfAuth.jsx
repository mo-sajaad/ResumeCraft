import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function RedirectIfAuth() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>; // wait until auth state known

  if (user) return <Navigate to="/dashboard" replace />;

  return <Outlet />; // render login/signup
}

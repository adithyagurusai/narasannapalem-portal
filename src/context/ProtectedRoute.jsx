
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ allowedRoles }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center">Checking access...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || !profile.is_active) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

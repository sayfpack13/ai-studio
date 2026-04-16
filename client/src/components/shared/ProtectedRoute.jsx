import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, verifyToken } from '../../services/api';
import { LoadingSpinner } from './shared';

/**
 * ProtectedRoute wraps routes that require admin authentication.
 * If the user is not authenticated, they are redirected to /admin
 * with a ?redirect= query param so they return after login.
 */
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const check = async () => {
      const token = getToken();
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        const result = await verifyToken();
        setAuthenticated(result.valid === true);
      } catch {
        setAuthenticated(false);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
        <p className="text-gray-400 mt-4">Verifying access…</p>
      </div>
    );
  }

  if (!authenticated) {
    const redirect = location.pathname + location.search;
    return <Navigate to={`/admin?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return children;
}
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, verifyToken } from '../../services/api';
import LoadingSpinner from "./LoadingSpinner";

function redirectChainsToNestedAdmin(redirectValue) {
  if (!redirectValue) return false;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = new URL(redirectValue, base);
    return u.pathname === '/admin' && u.searchParams.has('redirect');
  } catch {
    return false;
  }
}

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
  }, [location.pathname, location.search]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
        <p className="text-gray-400 mt-4">Verifying access…</p>
      </div>
    );
  }

  if (!authenticated) {
    // Login UI lives on /admin — must render children here. Navigating to /admin would
    // replace the outlet with Navigate (null) and hide the form.
    if (location.pathname === '/admin') {
      const params = new URLSearchParams(location.search);
      const r = params.get('redirect');
      if (redirectChainsToNestedAdmin(r)) {
        return <Navigate to="/admin" replace />;
      }
      if (r) {
        try {
          const base =
            typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
          const u = new URL(r, base);
          if (u.pathname === '/admin' && u.search === '') {
            return <Navigate to="/admin" replace />;
          }
        } catch {
          /* keep query */
        }
      }
      return children;
    }

    const params = new URLSearchParams(location.search);
    params.delete('redirect');
    const qs = params.toString();
    const pathAfterLogin = qs ? `${location.pathname}?${qs}` : location.pathname;
    return (
      <Navigate
        to={`/admin?redirect=${encodeURIComponent(pathAfterLogin)}`}
        replace
      />
    );
  }

  return children;
}
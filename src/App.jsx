import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AuthPage       from './pages/AuthPage';
import AdminDashboard from './pages/AdminDashboard';
import ClientPortal   from './pages/ClientPortal';

// Loading spinner shown while Firebase resolves auth state
function Spinner() {
  return (
    <div className="full-center">
      <div className="spinner" />
    </div>
  );
}

// Route guard — redirects to /auth if not logged in or wrong role
function Protected({ children, allowedRole }) {
  const { role, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!role)   return <Navigate to="/auth" replace />;
  if (allowedRole && role !== allowedRole)
    return <Navigate to={role === 'admin' ? '/admin' : '/portal'} replace />;
  return children;
}

export default function App() {
  const { role, loading } = useAuth();

  if (loading) return <Spinner />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Auth page — redirect away if already logged in */}
        <Route
          path="/auth"
          element={
            role
              ? <Navigate to={role === 'admin' ? '/admin' : '/portal'} replace />
              : <AuthPage />
          }
        />

        {/* Admin dashboard */}
        <Route
          path="/admin"
          element={
            <Protected allowedRole="admin">
              <AdminDashboard />
            </Protected>
          }
        />

        {/* Client portal */}
        <Route
          path="/portal"
          element={
            <Protected allowedRole="client">
              <ClientPortal />
            </Protected>
          }
        />

        {/* Catch-all — redirect based on current role */}
        <Route
          path="*"
          element={
            <Navigate
              to={role === 'admin' ? '/admin' : role === 'client' ? '/portal' : '/auth'}
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

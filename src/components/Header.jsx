import { useAuth, BRAND_NAME } from '../contexts/AuthContext';

export default function Header({ isAdmin = false }) {
  const { logout, clientRecord } = useAuth();
  const displayName = isAdmin ? 'Admin' : (clientRecord?.name || '—');

  return (
    <header className="portal-header">
      <div className="header-inner">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <div>
            <span className="logo-text">{BRAND_NAME}</span>
            <span className={`logo-sub ${isAdmin ? 'admin-badge' : ''}`}>
              {isAdmin ? 'Admin Panel' : 'Client Portal'}
            </span>
          </div>
        </div>

        <div className="header-right">
          <span className={`user-chip ${isAdmin ? 'admin-chip' : ''}`}>
            {isAdmin ? '🛡️' : '🔐'} <span>{displayName}</span>
          </span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </header>
  );
}

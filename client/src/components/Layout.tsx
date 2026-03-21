import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>NCOUNT</h1>
          <p>Beyond Pharmacy</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/upload">Upload Data</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/reconciliation">Reconciliation</NavLink>
          {(user?.role === 'admin' || user?.role === 'pharmacist') && (
            <NavLink to="/audit">Audit Log</NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <strong>{user?.username}</strong>
            <br />
            {user?.role}
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

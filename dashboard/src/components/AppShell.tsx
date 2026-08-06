import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/traces', label: 'Traces' },
  { to: '/policies', label: 'Policies' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/audit', label: 'Compliance' },
];

export function AppShell() {
  const { logout } = useAuth();

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__brand-mark">LS</span>
          <span className="shell__brand-name">LLM Sentinel</span>
        </div>
        <nav className="shell__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `shell__nav-link ${isActive ? 'shell__nav-link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="shell__logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}

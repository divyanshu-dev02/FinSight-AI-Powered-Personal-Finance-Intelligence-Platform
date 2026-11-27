import { Suspense } from 'react';
import { ArrowLeftRight, CalendarDays, LayoutDashboard, LogOut, Sparkles, Wallet } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/features/auth/AuthContext';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Accounts', path: '/accounts', icon: Wallet },
  { label: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { label: 'Planning', path: '/planning', icon: CalendarDays },
  { label: 'Copilot', path: '/copilot', icon: Sparkles },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const activePage = navItems.find(item => pathname === item.path)?.label ?? 'Dashboard';
  const initials = (user?.displayName?.trim() || 'User').split(/\s+/).slice(0, 2).map(word => word[0]).join('');

  return (
    <div className="workspace">
      <a className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-3" href="#main-content">
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link to="/dashboard" className="sidebar-brand" aria-label="FinSight dashboard"><Brand /></Link>
        <nav aria-label="Main navigation" className="workspace-nav">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} className="workspace-nav-link" end>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <span className="profile-avatar" aria-hidden="true">{initials}</span>
          <span className="truncate">{user?.displayName}</span>
          <button type="button" aria-label="Sign out" title="Sign out" className="sidebar-logout" onClick={() => void logout()}>
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-header">
          <Link to="/dashboard" className="mobile-brand" aria-label="FinSight dashboard"><Brand /></Link>
          <span className="workspace-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{activePage}</strong></span>
          <div className="workspace-user">
            <span className="profile-avatar" aria-hidden="true">{initials}</span>
            <span className="hidden max-w-40 truncate sm:inline">{user?.displayName}</span>
            <button type="button" aria-label="Sign out" title="Sign out" className="mobile-logout" onClick={() => void logout()}>
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content">
          <Suspense fallback={<div className="grid min-h-48 place-items-center" role="status"><LoadingSpinner /><span className="sr-only">Loading page</span></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

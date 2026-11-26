import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { label: 'Accounts', path: '/accounts', icon: '🏦' },
  { label: 'Transactions', path: '/transactions', icon: '💸' },
  { label: 'Planning', path: '/planning', icon: '📋' },
  { label: 'Copilot', path: '/copilot', icon: '💡' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-slate-50/70">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-gray-200/80 bg-white lg:block shadow-xs">
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-extrabold text-lg shadow-sm">
            F
          </div>
          <span className="text-xl font-extrabold tracking-tight text-gray-900">FinSight</span>
        </div>
        <nav className="mt-4 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200/80 bg-white px-6 shadow-2xs">
          <h1 className="text-lg font-bold text-gray-800">
            {navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? 'Dashboard'}
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                {(user?.displayName || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.displayName}</span>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        <nav aria-label="Main navigation" className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 lg:hidden">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={location.pathname === item.path ? 'page' : undefined}
              className="rounded px-2 py-3 text-sm text-slate-700 aria-[current=page]:font-semibold aria-[current=page]:text-blue-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

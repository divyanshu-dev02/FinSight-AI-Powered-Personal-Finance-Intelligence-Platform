import { lazy, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { AppLayout } from '@/app/AppLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })));
const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage').then(module => ({ default: module.AccountsPage })));
const TransactionsPage = lazy(() => import('@/features/transactions/TransactionsPage').then(module => ({ default: module.TransactionsPage })));
const CopilotPage = lazy(() => import('@/features/copilot/CopilotPage').then(module => ({ default: module.CopilotPage })));
const PlanningPage = lazy(() => import('@/features/planning/PlanningPage').then(module => ({ default: module.PlanningPage })));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


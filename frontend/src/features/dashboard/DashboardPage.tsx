import { useAuth } from '@/features/auth/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';
import { FinancialSummary, Transaction } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialSummary>>('/dashboard/summary');
      return res.data.data;
    },
  });

  const { data: recentTransactions, isLoading: isTxLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Transaction[]>>('/dashboard/recent-transactions?limit=5');
      return res.data.data;
    },
  });

  const currency = summary?.currency || user?.baseCurrency || 'INR';

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-5">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
          Welcome back, {user?.displayName || 'User'}!
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Here is your Financial Digital Twin real-time intelligence summary.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Total Net Worth</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              formatCurrency(summary?.totalNetWorth || 0, currency)
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400">Sum of all active account balances</p>
        </div>

        <div className="overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Monthly Income</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-emerald-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `+ ${formatCurrency(summary?.totalIncome || 0, currency)}`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400">Current calendar month inflows</p>
        </div>

        <div className="overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Monthly Expenses</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-red-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `- ${formatCurrency(summary?.totalExpense || 0, currency)}`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400">Current calendar month outflows</p>
        </div>

        <div className="overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Savings Rate</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-blue-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `${summary?.savingsRatePercentage || 0}%`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400">Net cash flow / total income</p>
        </div>
      </div>

      {/* Recent Transactions & Getting Started Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h3 className="text-base font-semibold text-gray-900">Recent Transactions</h3>
            <Link to="/transactions" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all →
            </Link>
          </div>

          {isTxLoading ? (
            <div className="flex justify-center p-6">
              <LoadingSpinner size="md" />
            </div>
          ) : recentTransactions && recentTransactions.length > 0 ? (
            <ul className="divide-y divide-gray-100 mt-2">
              {recentTransactions.map((tx) => (
                <li key={tx.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(tx.transactionDate)} · {tx.accountName}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      tx.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'
                    }`}
                  >
                    {tx.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              No recent transactions recorded.{' '}
              <Link to="/transactions" className="text-blue-600 hover:underline">
                Add one now
              </Link>
            </div>
          )}
        </div>

        {/* Category Spending Breakdown */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 border-b border-gray-100 pb-4">
            Monthly Category Breakdown
          </h3>

          {summary?.categoryBreakdown && summary.categoryBreakdown.length > 0 ? (
            <ul className="space-y-3 mt-4">
              {summary.categoryBreakdown.map((cat) => (
                <li key={cat.categoryId} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color || '#3B82F6' }}
                      />
                      {cat.categoryName}
                    </span>
                    <span className="text-gray-900 font-semibold">
                      {formatCurrency(cat.totalSpent, currency)} ({cat.percentageOfTotal}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(cat.percentageOfTotal, 100)}%`,
                        backgroundColor: cat.color || '#3B82F6',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              No category spending recorded this month.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
      const res = await api.get<ApiResponse<Transaction[]>>('/dashboard/recent-transactions?limit=6');
      return res.data.data;
    },
  });

  const currency = summary?.currency || user?.baseCurrency || 'INR';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-5 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Welcome back, {user?.displayName || 'User'} 👋
          </h2>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            Here is your Financial Digital Twin real-time intelligence summary.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-all cursor-pointer"
          >
            <span>+</span>
            <span>Record Transaction</span>
          </Link>
          <Link
            to="/accounts"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-all cursor-pointer"
          >
            <span>🏦</span>
            <span>Manage Accounts</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Worth */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-xs border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Net Worth</dt>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-sm">
              💎
            </span>
          </div>
          <dd className="mt-3 text-2xl font-black tracking-tight text-gray-900">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              formatCurrency(summary?.totalNetWorth || 0, currency)
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400 font-medium">Active accounts balance</p>
        </div>

        {/* Monthly Inflow */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-xs border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Monthly Inflow</dt>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-sm">
              📈
            </span>
          </div>
          <dd className="mt-3 text-2xl font-black tracking-tight text-emerald-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `+ ${formatCurrency(summary?.totalIncome || 0, currency)}`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400 font-medium">Calendar month credits</p>
        </div>

        {/* Monthly Outflow */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-xs border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Monthly Outflow</dt>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-600 text-sm">
              📉
            </span>
          </div>
          <dd className="mt-3 text-2xl font-black tracking-tight text-red-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `- ${formatCurrency(summary?.totalExpense || 0, currency)}`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400 font-medium">Calendar month debits</p>
        </div>

        {/* Savings Rate */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-xs border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Savings Rate</dt>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-sm">
              🎯
            </span>
          </div>
          <dd className="mt-3 text-2xl font-black tracking-tight text-indigo-600">
            {isSummaryLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              `${summary?.savingsRatePercentage || 0}%`
            )}
          </dd>
          <p className="mt-1 text-xs text-gray-400 font-medium">Net savings of total income</p>
        </div>
      </div>

      {/* Main Grid: Recent Transactions & Category Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Transactions Card */}
        <div className="rounded-2xl bg-white p-6 shadow-xs border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🕒</span>
              <h3 className="text-base font-bold text-gray-900">Recent Transactions</h3>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all →
            </Link>
          </div>

          {isTxLoading ? (
            <div className="flex justify-center p-8">
              <LoadingSpinner size="md" />
            </div>
          ) : recentTransactions && recentTransactions.length > 0 ? (
            <ul className="divide-y divide-gray-100 mt-2">
              {recentTransactions.map((tx) => (
                <li key={tx.id} className="py-3.5 flex items-center justify-between hover:bg-gray-50/50 rounded-lg px-2 transition-colors">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${
                        tx.direction === 'CREDIT'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {tx.direction === 'CREDIT' ? '↓' : '↑'}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(tx.transactionDate)} · {tx.accountName}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      tx.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'
                    }`}
                  >
                    {tx.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-12 text-center text-sm text-gray-400 space-y-2">
              <p>No recent transactions recorded.</p>
              <Link to="/transactions" className="inline-block text-xs font-semibold text-blue-600 hover:underline">
                Add your first transaction →
              </Link>
            </div>
          )}
        </div>

        {/* Category Spending Breakdown Card */}
        <div className="rounded-2xl bg-white p-6 shadow-xs border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <h3 className="text-base font-bold text-gray-900">Monthly Spending Breakdown</h3>
            </div>
            <span className="text-xs text-gray-400 font-medium">By Category</span>
          </div>

          {summary?.categoryBreakdown && summary.categoryBreakdown.length > 0 ? (
            <ul className="space-y-4 mt-4">
              {summary.categoryBreakdown.map((cat) => (
                <li key={cat.categoryId} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-2 text-gray-800">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cat.color || '#3B82F6' }}
                      />
                      {cat.categoryName}
                    </span>
                    <span className="text-gray-900">
                      {formatCurrency(cat.totalSpent, currency)}{' '}
                      <span className="text-gray-400 font-normal">({cat.percentageOfTotal}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
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
            <div className="py-12 text-center text-sm text-gray-400 space-y-2">
              <p>No category expenses recorded this month.</p>
              <p className="text-xs text-gray-400">
                Categorized expenses from statement imports will appear here automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

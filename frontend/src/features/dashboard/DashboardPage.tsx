import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';
import { FinancialSummary, Transaction } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function DashboardPage() {
  const { user } = useAuth();
  // Helper to format YYYY-MM in local calendar time
  const getLocalMonthString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonthStr = getLocalMonthString();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [isWakingUp, setIsWakingUp] = useState(false);

  const { data: summary, isLoading: isSummaryLoading, isFetching: isSummaryFetching } = useQuery({
    queryKey: ['dashboard-summary', selectedMonth],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialSummary>>(`/dashboard/summary?month=${selectedMonth}`);
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

  // Server wakeup detection for free tier cold starts (> 3 seconds loading)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isSummaryFetching) {
      timer = setTimeout(() => {
        setIsWakingUp(true);
      }, 3000);
    } else {
      setIsWakingUp(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSummaryFetching]);

  const currency = summary?.currency || user?.baseCurrency || 'INR';

  const handlePrevMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0] || '0', 10) || new Date().getFullYear();
    let m = parseInt(parts[1] || '0', 10) || new Date().getMonth() + 1;
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0] || '0', 10) || new Date().getFullYear();
    let m = parseInt(parts[1] || '0', 10) || new Date().getMonth() + 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const formatMonthTitle = (monthStr: string) => {
    const parts = monthStr.split('-');
    const y = parseInt(parts[0] || '0', 10) || new Date().getFullYear();
    const m = parseInt(parts[1] || '0', 10) || new Date().getMonth() + 1;
    const date = new Date(y, m - 1, 1);
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(date);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cold Start Waking Server Alert */}
      {isWakingUp && (
        <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200 text-amber-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xl animate-spin">⏳</span>
            <div>
              <p className="text-sm font-bold">Waking up cloud backend instance...</p>
              <p className="text-xs text-amber-700">
                Render free tier instances sleep after 15 min of inactivity. The initial wake-up takes ~30–45 seconds. Thank you for your patience!
              </p>
            </div>
          </div>
          <LoadingSpinner size="sm" />
        </div>
      )}

      {/* Welcome Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-5 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Welcome back, {user?.displayName || 'User'} 👋
          </h2>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            Your Financial Digital Twin with real-time multi-currency intelligence.
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

      {/* Month Selection Bar & Comparison Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white px-5 py-3.5 rounded-2xl border border-gray-200 shadow-xs gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold transition-colors cursor-pointer"
            title="Previous Month"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 min-w-[140px] text-center">
              {formatMonthTitle(selectedMonth)}
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 px-2 py-1 text-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold transition-colors cursor-pointer"
            title="Next Month"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedMonth !== currentMonthStr ? (
            <button
              onClick={() => setSelectedMonth(currentMonthStr)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Jump to Current Month
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Current Month
            </span>
          )}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Worth (Assets - Loans) */}
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
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-100">
            <span>Assets: <strong className="text-emerald-600">+{formatCurrency(summary?.totalAssets || 0, currency)}</strong></span>
            <span>Loans: <strong className="text-red-600">-{formatCurrency(summary?.totalLiabilities || 0, currency)}</strong></span>
          </div>
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
          <div className="mt-2 flex items-center gap-1.5 text-xs pt-2 border-t border-gray-100">
            {summary?.incomeChangePercentage != null ? (
              <span className={`font-semibold ${summary.incomeChangePercentage >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {summary.incomeChangePercentage >= 0 ? '↑ +' : '↓ '}{summary.incomeChangePercentage}%
              </span>
            ) : (
              <span className="text-gray-400">No prior data</span>
            )}
            <span className="text-gray-400 text-[11px]">vs last month</span>
          </div>
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
          <div className="mt-2 flex items-center gap-1.5 text-xs pt-2 border-t border-gray-100">
            {summary?.expenseChangePercentage != null ? (
              <span className={`font-semibold ${summary.expenseChangePercentage <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.expenseChangePercentage <= 0 ? '↓ ' : '↑ +'}{summary.expenseChangePercentage}%
              </span>
            ) : (
              <span className="text-gray-400">No prior data</span>
            )}
            <span className="text-gray-400 text-[11px]">vs last month</span>
          </div>
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
          <div className="mt-2 flex items-center gap-1.5 text-xs pt-2 border-t border-gray-100">
            {summary?.savingsRateChange != null ? (
              <span className={`font-semibold ${summary.savingsRateChange >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {summary.savingsRateChange >= 0 ? '↑ +' : '↓ '}{summary.savingsRateChange}%
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
            <span className="text-gray-400 text-[11px]">rate change</span>
          </div>
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
                        tx.isTransfer
                          ? 'bg-blue-50 text-blue-600'
                          : tx.direction === 'CREDIT'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {tx.isTransfer ? '⇄' : tx.direction === 'CREDIT' ? '↓' : '↑'}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(tx.transactionDate)} · {tx.accountName}
                        {tx.isTransfer && <span className="ml-1 text-blue-600 font-medium">(Transfer)</span>}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      tx.isTransfer
                        ? 'text-blue-600'
                        : tx.direction === 'CREDIT'
                        ? 'text-emerald-600'
                        : 'text-gray-900'
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
              <h3 className="text-base font-bold text-gray-900">Spending by Category</h3>
              <Link to={`/copilot?month=${selectedMonth}`} className="text-sm font-medium text-blue-700 underline">
                Explore spending in Copilot
              </Link>
            </div>
            <span className="text-xs text-gray-500 font-semibold">{formatMonthTitle(selectedMonth)}</span>
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
              <p>No category expenses recorded for {formatMonthTitle(selectedMonth)}.</p>
              <p className="text-xs text-gray-400">
                (Note: Internal transfers between your accounts are intentionally excluded from expenses).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

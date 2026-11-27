import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarDays,
  ChevronLeft, ChevronRight, CircleDollarSign, ReceiptText, Sparkles, Target, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/features/auth/AuthContext';
import { PlanningSnapshot } from '@/features/planning/PlanningSnapshot';
import { api, ApiResponse } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FinancialSummary, Transaction } from '@/types/finance';
import { SpendingBrief } from './SpendingBrief';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthDate(month: string, offset = 0) {
  const [year = new Date().getFullYear(), number = 1] = month.split('-').map(Number);
  return new Date(year, number - 1 + offset, 1);
}

function monthLabel(month: string, offset = 0) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(monthDate(month, offset));
}

const metricDefinitions = [
  { label: 'Net worth', key: 'totalNetWorth', icon: Wallet, tone: 'blue', detail: 'Assets minus liabilities' },
  { label: 'Income', key: 'totalIncome', icon: ArrowDownLeft, tone: 'green', detail: 'Money in this month' },
  { label: 'Expenses', key: 'totalExpense', icon: ArrowUpRight, tone: 'orange', detail: 'Money out this month' },
  { label: 'Savings rate', key: 'savingsRatePercentage', icon: Target, tone: 'purple', detail: 'Share of income saved' },
] as const;

function CashFlow({ summary, month }: { summary: FinancialSummary; month: string }) {
  const months = [
    { label: monthLabel(month, -1), income: summary.previousMonthIncome, expense: summary.previousMonthExpense },
    { label: monthLabel(month), income: summary.totalIncome, expense: summary.totalExpense },
  ];
  const scale = Math.max(1, ...months.flatMap(({ income, expense }) => [Math.abs(income ?? 0), Math.abs(expense ?? 0)]));
  return (
    <div className="cash-chart">
      <div className="cash-legend"><span><i />Income</span><span><i />Expenses</span></div>
      {months.map(({ label, income, expense }) => (
        <section key={label} className="cash-period" aria-label={label}>
          <h3>{label}</h3>
          {income == null && expense == null ? <p className="panel-empty">No comparison data.</p> : (
            <dl className="cash-bars">
              {([['Income', income], ['Expenses', expense]] as const).map(([name, amount]) => (
                <div key={name} className="cash-bar-row">
                  <dt className="sr-only">{name}</dt>
                  <span className="cash-track" aria-hidden="true">
                    <span style={{ width: `${Math.abs(amount ?? 0) / scale * 100}%` }} />
                  </span>
                  <dd>{amount == null ? '—' : formatCurrency(amount, summary.currency)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const summary = useQuery({
    queryKey: ['dashboard-summary', month, user?.id],
    queryFn: async ({ signal }) => {
      const response = await api.get<ApiResponse<FinancialSummary>>('/dashboard/summary', { params: { month }, signal });
      return response.data.data;
    },
  });
  const recent = useQuery({
    queryKey: ['recent-transactions', user?.id],
    queryFn: async ({ signal }) => {
      const response = await api.get<ApiResponse<Transaction[]>>('/dashboard/recent-transactions', { params: { limit: 6 }, signal });
      return response.data.data;
    },
  });

  const currency = summary.data?.currency ?? user?.baseCurrency ?? 'INR';
  const name = user?.displayName?.trim().split(/\s+/)[0];
  const categoryRows = summary.data?.categoryBreakdown ?? [];
  const changes = {
    totalNetWorth: null,
    totalIncome: summary.data?.incomeChangePercentage,
    totalExpense: summary.data?.expenseChangePercentage,
    savingsRatePercentage: summary.data?.savingsRateChange,
  };

  return (
    <div className="dashboard">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="hero-content">
          <h1 id="dashboard-title">{name ? `Welcome back, ${name}` : 'Your financial overview'}</h1>
          <p>Review your cash flow, track spending, and see what’s coming up.</p>
          <div className="hero-actions">
            <Link to={`/copilot?month=${month}`} className="hero-primary"><Sparkles size={17} aria-hidden="true" /> Ask Copilot</Link>
            <Link to="/transactions" className="hero-secondary">View transactions <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit hero-orbit-outer" /><div className="hero-orbit hero-orbit-inner" />
          <div className="hero-tiles"><span><Wallet /></span><span><CircleDollarSign /></span><span><ArrowUpRight /></span></div>
        </div>
      </section>

      <section className="overview" aria-labelledby="overview-title">
        <div className="dashboard-section-heading">
          <div><h2 id="overview-title">Financial overview</h2><p>Balances and monthly activity in {currency}.</p></div>
          <div className="month-tools">
            {month !== currentMonth && <button type="button" className="dashboard-text-button" onClick={() => setMonth(currentMonth)}>This month</button>}
            <div className="month-picker">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(monthKey(monthDate(month, -1)))}><ChevronLeft size={18} /></button>
              <label className="month-input"><CalendarDays size={16} aria-hidden="true" /><span>{monthLabel(month)}</span>
                <input type="month" aria-label="Reporting month" value={month} onChange={event => event.target.value && setMonth(event.target.value)} />
              </label>
              <button type="button" aria-label="Next month" onClick={() => setMonth(monthKey(monthDate(month, 1)))}><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>
        {summary.isError && <p role="alert" className="dashboard-error">Couldn’t load your overview. <button type="button" onClick={() => void summary.refetch()}>Retry</button></p>}
        <dl className="metric-grid" aria-busy={summary.isPending}>
          {metricDefinitions.map(({ label, key, icon: Icon, tone, detail }) => {
            const value = summary.data?.[key];
            const change = changes[key];
            return (
              <div className="metric-card" key={key}>
                <dt><span className={`metric-icon metric-${tone}`}><Icon size={18} aria-hidden="true" /></span>{label}</dt>
                <dd>{value == null ? '—' : key === 'savingsRatePercentage' ? `${value}%` : formatCurrency(value, currency)}</dd>
                <p>{change == null ? detail : `${change > 0 ? '+' : ''}${change}${key === 'savingsRatePercentage' ? ' pp' : '%'} vs previous month`}</p>
                {key === 'totalNetWorth' && summary.data && (
                  <p>Assets {formatCurrency(summary.data.totalAssets, currency)} · Loans {formatCurrency(summary.data.totalLiabilities, currency)}</p>
                )}
              </div>
            );
          })}
        </dl>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="cash-flow-title">
          <header className="panel-heading"><div><h2 id="cash-flow-title">Cash flow</h2><p>Income and expenses by month</p></div></header>
          {summary.data ? <CashFlow summary={summary.data} month={month} /> : <p className="panel-empty" role="status">{summary.isPending ? 'Loading cash flow…' : 'Cash flow is unavailable.'}</p>}
        </section>

        <section className="dashboard-panel" aria-labelledby="spending-title">
          <header className="panel-heading"><div><h2 id="spending-title">Spending by category</h2><p>{monthLabel(month)} · Transfers excluded</p></div></header>
          {categoryRows.length ? (
            <ul className="category-list">
              {categoryRows.map(category => (
                <li key={category.categoryId}>
                  <div><span><i style={{ backgroundColor: category.color || '#3265e7' }} />{category.categoryName}</span><strong>{formatCurrency(category.totalSpent, currency)}</strong></div>
                  <div className="category-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(category.percentageOfTotal, 100))}%`, backgroundColor: category.color || '#3265e7' }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="panel-empty">{summary.isPending ? 'Loading categories…' : summary.isError ? 'Category totals are unavailable.' : 'No category expenses for this month.'}</p>}
        </section>

        <section className="dashboard-panel recent-panel" aria-labelledby="transactions-title">
          <header className="panel-heading">
            <div><h2 id="transactions-title">Recent transactions</h2><p>Latest activity across your accounts</p></div>
            <Link to="/transactions" className="panel-link">View all <ArrowRight size={16} aria-hidden="true" /></Link>
          </header>
          {recent.isPending ? <div className="grid place-items-center p-8" role="status"><LoadingSpinner /><span className="sr-only">Loading transactions</span></div>
            : recent.isError ? <p role="alert" className="panel-empty">Couldn’t load transactions. <button type="button" className="dashboard-text-button" onClick={() => void recent.refetch()}>Retry</button></p>
            : recent.data?.length ? (
              <ul className="recent-list">
                {recent.data.map(transaction => {
                  const Icon = transaction.isTransfer ? ArrowLeftRight : transaction.direction === 'CREDIT' ? ArrowDownLeft : ReceiptText;
                  return (
                    <li key={transaction.id}>
                      <span className={`metric-icon ${transaction.direction === 'CREDIT' && !transaction.isTransfer ? 'metric-green' : 'metric-blue'}`}><Icon size={17} aria-hidden="true" /></span>
                      <div><strong>{transaction.description}</strong><small>{formatDate(transaction.transactionDate)} · {transaction.accountName}{transaction.isTransfer && ' · Transfer'}</small></div>
                      <span className="recent-amount">{transaction.direction === 'CREDIT' ? '+' : '−'}{formatCurrency(transaction.amount, transaction.currency)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="panel-empty">No transactions yet. <Link className="dashboard-text-button" to="/transactions">Add your first transaction</Link></p>}
        </section>
      </div>

      {user && <><PlanningSnapshot month={month} userId={user.id} /><SpendingBrief month={month} userId={user.id} /></>}
    </div>
  );
}

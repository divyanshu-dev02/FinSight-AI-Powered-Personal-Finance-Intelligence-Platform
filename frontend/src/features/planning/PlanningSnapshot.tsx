import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '@/lib/utils';
import { usePlanning } from './planning';

export function PlanningSnapshot({ month, userId }: { month: string; userId: string }) {
  const planning = usePlanning(userId, month);
  const upcoming = planning.data?.occurrences
    .filter(item => item.dueDate >= planning.data.today && !item.transactionId).slice(0, 3) ?? [];
  const budgets = planning.data?.budgets.slice(0, 3) ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="dashboard-planning">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dashboard-planning" className="text-lg font-bold text-slate-900">Planning</h2>
        <Link to={`/planning?month=${month}`} className="text-sm font-semibold text-blue-700 underline">Open planning</Link>
      </div>
      {planning.isPending && <p role="status" className="mt-2 text-sm text-slate-600">Loading your plan…</p>}
      {planning.isError && <p role="alert" className="mt-2 text-sm text-slate-600">Could not load your plan. <button type="button" onClick={() => void planning.refetch()} className="text-blue-700 underline">Retry</button></p>}
      {planning.data && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Budget progress</h3>
            {budgets.length ? (
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                {budgets.map(item => <li key={item.id}>{item.categoryName} · {formatCurrency(item.spent, item.currency)} of {formatCurrency(item.amount, item.currency)}</li>)}
              </ul>
            ) : <p className="text-sm text-slate-600">No budgets for this month.</p>}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Upcoming bills and income</h3>
            {upcoming.length ? (
              <ul className="mt-1 space-y-1 text-sm text-slate-700">
                {upcoming.map(item => <li key={`${item.commitmentId}/${item.dueDate}`}>
                  {item.name} · {formatDate(item.dueDate)} · {item.direction === 'DEBIT' ? '−' : '+'}{formatCurrency(item.amount, item.currency)}
                </li>)}
              </ul>
            ) : <p className="text-sm text-slate-600">No outstanding events in the next 30 days.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

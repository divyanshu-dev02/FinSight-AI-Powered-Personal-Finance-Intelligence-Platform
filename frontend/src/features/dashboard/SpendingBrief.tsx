import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiResponse } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

type Finding = {
  id: string;
  kind: 'SPENDING_CHANGE' | 'RECURRING_CANDIDATE' | 'RECURRING_INCREASE';
  merchant?: string;
  currency: string;
  previousAmount: number;
  currentAmount: number;
  evidence: { id: string; date: string; amount: number }[];
};

type Brief = {
  periods: { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string };
  findings: Finding[];
};

export function SpendingBrief({ month, userId }: { month: string; userId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['dashboard-summary', 'brief', userId, month];
  const brief = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await api.get<ApiResponse<Brief>>('/dashboard/brief', { params: { month }, signal });
      return response.data.data;
    },
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => api.put(`/dashboard/brief/dismissals/${id}`),
    onSuccess: async (_, id) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<Brief>(queryKey, cached => cached && {
        ...cached,
        findings: cached.findings.filter(finding => finding.id !== id),
      });
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section aria-labelledby="spending-brief-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="spending-brief-title" className="text-lg font-bold text-slate-900">What changed?</h2>
        <Link to={`/copilot?month=${month}&comparison=brief`} className="text-sm font-semibold text-blue-700 underline">
          Ask Copilot
        </Link>
      </div>
      {brief.isPending && <p role="status" className="mt-3 text-sm text-slate-600">Checking spending and recurring charges…</p>}
      {brief.isError && (
        <p role="alert" className="mt-3 text-sm text-slate-700">
          The spending brief is unavailable.{' '}
          <button type="button" onClick={() => void brief.refetch()} className="text-blue-700 underline">Retry</button>
        </p>
      )}
      {brief.data?.findings.length === 0 && <p className="mt-3 text-sm text-slate-600">No new findings for this month.</p>}
      {brief.data && brief.data.findings.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {brief.data.findings.map(finding => {
            const spendingChange = finding.kind === 'SPENDING_CHANGE';
            const change = finding.currentAmount - finding.previousAmount;
            const money = (amount: number) => formatCurrency(amount, finding.currency);
            const title = spendingChange
              ? `Spending ${change > 0 ? 'rose' : 'fell'} by ${money(Math.abs(change))}`
              : finding.kind === 'RECURRING_INCREASE'
                ? `${finding.merchant} charged ${money(change)} more`
                : `Possible recurring charge from ${finding.merchant}`;
            const { currentStart, currentEnd, previousStart, previousEnd } = brief.data.periods;
            return (
              <li key={finding.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="min-w-0 break-words font-semibold text-slate-900">{title}</h3>
                  <button type="button" aria-label={`Dismiss: ${title}`} disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate(finding.id)}
                    className="rounded py-2 text-sm text-slate-600 underline disabled:opacity-50">
                    Dismiss
                  </button>
                </div>
                <p className="text-sm text-slate-700">
                  {money(finding.currentAmount)} compared with {money(finding.previousAmount)}
                  {spendingChange && (
                    <> · {formatDate(currentStart)} – {formatDate(currentEnd)} vs. {formatDate(previousStart)} – {formatDate(previousEnd)}</>
                  )}
                </p>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-blue-700">View supporting transactions</summary>
                  <ul className="mt-2 space-y-2">
                    {finding.evidence.map(transaction => (
                      <li key={transaction.id}>
                        <Link to={`/transactions?evidence=${transaction.id}`} className="text-blue-700 underline">
                          {formatDate(transaction.date)} · {money(transaction.amount)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
                {dismiss.isError && dismiss.variables === finding.id && (
                  <p role="alert" className="text-sm text-red-700">Could not dismiss this finding. Try again.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

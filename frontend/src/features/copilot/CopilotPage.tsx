import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

type Total = { currency: string; amount: number };
type Expense = Total & { id: string; date: string };
type Spending = {
  month: string;
  previousMonth: string;
  current: Total[];
  previous: Total[];
  evidence: Expense[];
  calculatedAt: string;
};

const questions = [
  'How much did I spend?',
  'How does that compare with last month?',
  'Which recent expenses can I review?',
] as const;

type Question = (typeof questions)[number];

export function CopilotPage() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const month = params.get('month') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [question, setQuestion] = useState<Question>(questions[0]);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['copilot-spending', month],
    queryFn: async ({ signal }) => {
      const response = await api.get<ApiResponse<Spending>>('/copilot/spending', {
        params: { month },
        signal,
      });
      return response.data.data;
    },
  });
  const [input, setInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const availability = useQuery({
    queryKey: ['copilot-availability'],
    queryFn: async () => (await api.get<ApiResponse<boolean>>('/copilot/availability')).data.data,
  });
  const ask = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiResponse<'SPENDING' | 'COMPARISON' | 'EVIDENCE' | 'UNSUPPORTED'>>(
        '/copilot/question', { question: input.trim(), consent }
      );
      return response.data.data;
    },
    onSuccess: intent => {
      const answers = { SPENDING: questions[0], COMPARISON: questions[1], EVIDENCE: questions[2] };
      setUnsupported(intent === 'UNSUPPORTED');
      if (intent !== 'UNSUPPORTED') setQuestion(answers[intent]);
    },
  });
  const currencies = [...new Set([...data?.current ?? [], ...data?.previous ?? []].map(total => total.currency))];

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-slate-600">Explore posted spending across active accounts.</p>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Statement month
          <input
            type="month"
            value={month}
            onChange={event => event.target.value && setParams({ month: event.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map(item => (
          <button
            key={item}
            type="button"
            aria-pressed={question === item}
            onClick={() => setQuestion(item)}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 aria-pressed:border-blue-600 aria-pressed:bg-blue-50"
          >
            {item}
          </button>
        ))}
      </div>
      {availability.data && (
        <form
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={event => {
            event.preventDefault();
            setUnsupported(false);
            if (consent && input.trim() && !ask.isPending) ask.mutate();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Ask about the selected month
            <input value={input} onChange={event => setInput(event.target.value)} maxLength={300}
              className="min-w-0 rounded-lg border border-slate-300 px-3 py-2"
              placeholder="How does my spending compare?" />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
            Send my question to OpenAI. Keep personal or account details out of the question.
          </label>
          <button type="submit" disabled={!consent || !input.trim() || ask.isPending}
            className="w-fit rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {ask.isPending ? 'Checking…' : 'Ask Copilot'}
          </button>
          {unsupported && <p role="status">Try asking for total spending, a comparison with last month, or recent expenses.</p>}
          {ask.isError && <p role="alert">AI questions are unavailable right now. You can still use the options above.</p>}
        </form>
      )}
      <div aria-live="polite" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold text-slate-900">{question}</h2>
        {isFetching && <p>Checking your transactions…</p>}
        {isError && (
          <p role="alert">
            Spending data could not be loaded.{' '}
            <button type="button" className="font-medium text-blue-700 underline" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        )}
        {data && question === questions[0] && (
          data.current.length ? (
            <ul className="space-y-2">
              {data.current.map(({ amount, currency }) => (
                <li key={currency}>{formatCurrency(amount, currency)} <span className="text-slate-500">{currency}</span></li>
              ))}
            </ul>
          ) : <p>No posted expenses in {month}.</p>
        )}
        {data && question === questions[1] && (
          currencies.length ? (
            <ul className="space-y-2">
              {currencies.map(currency => (
                <li key={currency}>
                  {currency} · {data.previousMonth}: {formatCurrency(data.previous.find(total => total.currency === currency)?.amount ?? 0, currency)}
                  {' → '}{month}: {formatCurrency(data.current.find(total => total.currency === currency)?.amount ?? 0, currency)}
                </li>
              ))}
            </ul>
          ) : <p>No posted expenses in either month.</p>
        )}
        {data && question === questions[2] && (
          data.evidence.length ? (
            <ul className="divide-y divide-slate-100">
              {data.evidence.map(expense => (
                <li key={expense.id} className="py-2">
                  <Link to={`/transactions?evidence=${expense.id}`} className="text-blue-700 underline">
                    {expense.date} · {formatCurrency(expense.amount, expense.currency)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>No expenses to review in {month}.</p>
        )}
        {data && <p className="text-xs text-slate-600">Transfers excluded. Calculated {new Date(data.calculatedAt).toLocaleString()}.</p>}
      </div>
    </section>
  );
}

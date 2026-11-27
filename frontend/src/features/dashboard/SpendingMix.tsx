import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export type SpendingMerchant = { name: string; currency: string; amount: number };
export type SpendingCategory = SpendingMerchant & { categoryId?: string };

const percentage = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 });
const colors = ['#1d4ed8', '#0e7490', '#6d28d9', '#0f766e', '#b45309'];
const remainder = '#cbd5e1';

export function SpendingMix({ categories, merchants, total, formatter, filters }: {
  categories: SpendingCategory[];
  merchants: SpendingMerchant[];
  total: number;
  formatter: Intl.NumberFormat;
  filters: URLSearchParams;
}) {
  const [view, setView] = useState<'categories' | 'merchants'>('categories');
  const [expanded, setExpanded] = useState(false);
  const byCategory = view === 'categories';
  const topCategories = categories.slice(0, 5);
  const entries = byCategory
    ? (expanded ? categories : topCategories).map((category, index) => ({
        ...category, key: category.categoryId ?? 'uncategorized', color: colors[index] ?? remainder,
        filter: category.categoryId ? { categoryId: category.categoryId } : undefined,
      }))
    : merchants.map(merchant => ({
        ...merchant, key: merchant.name, color: colors[0], filter: { merchant: merchant.name },
      }));
  let offset = 0;
  const ring = topCategories.map(({ amount }, index) => {
    const start = offset;
    offset = Math.min(100, offset + amount / total * 100);
    return `${colors[index]} ${start}% ${offset}%`;
  });
  const hasOther = byCategory && categories.length > topCategories.length;
  if (offset < 100) ring.push(`${remainder} ${offset}% 100%`);

  return (
    <section className="mt-6 border-t border-slate-200 pt-4" aria-labelledby="spending-mix-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="spending-mix-title" className="font-bold text-slate-900">Where your money went</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {byCategory ? 'Share of spending by category' : 'Top named merchants by spending'} in the selected range and currency
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Spending breakdown">
          {(['categories', 'merchants'] as const).map(option => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}
              className="min-h-8 rounded-md px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 aria-pressed:bg-white aria-pressed:text-blue-800 aria-pressed:shadow-sm">
              {option === 'categories' ? 'Categories' : 'Merchants'}
            </button>
          ))}
        </div>
      </header>

      {entries.length ? (
        <div className={`mt-4 grid min-w-0 gap-5 ${byCategory ? 'sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]' : ''}`}>
          {byCategory && total > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1" aria-hidden="true">
              <div className="grid aspect-square w-36 place-items-center rounded-full lg:w-44"
                style={{ backgroundImage: `conic-gradient(${ring.join(', ')})` }}>
                <div className="grid aspect-square w-[75%] place-content-center rounded-full bg-white text-center">
                  <span className="text-xs text-slate-600">Total spent</span>
                  <strong className="max-w-28 break-all px-1 text-sm tabular-nums text-slate-900">{formatter.format(total)}</strong>
                </div>
              </div>
              {hasOther && <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="h-2 w-2 rounded-full bg-slate-300" /> Other categories
              </span>}
            </div>
          )}

          <div className="min-w-0">
            <ul className="space-y-3.5">
              {entries.map(entry => {
                const share = total > 0 ? entry.amount / total : 0;
                const url = new URLSearchParams(filters);
                if (entry.filter) Object.entries(entry.filter).forEach(([key, value]) => url.set(key, value));
                return (
                  <li key={entry.key}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                        {entry.filter
                          ? <Link to={`/transactions?${url}`} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-blue-700 hover:underline">
                              <span className="break-words">{entry.name}</span><ArrowRight size={13} className="shrink-0" aria-hidden="true" />
                            </Link>
                          : <span className="break-words font-semibold text-slate-800">{entry.name}</span>}
                      </div>
                      <span className="font-semibold tabular-nums text-slate-900">{formatter.format(entry.amount)} <span className="ml-1 text-xs font-medium text-slate-600">{percentage.format(share)}</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
                        style={{ width: `${Math.min(share * 100, 100)}%`, backgroundColor: entry.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasOther && <button type="button" aria-expanded={expanded}
              onClick={() => setExpanded(current => !current)}
              className="mt-4 text-sm font-semibold text-blue-700 hover:underline">
              {expanded ? 'Show top five' : `Show all ${categories.length} categories`}
            </button>}
          </div>
        </div>
      ) : <p className="mt-3 text-sm text-slate-600">{byCategory ? 'No spending in this range.' : 'No expenses with merchant names in this range.'}</p>}
    </section>
  );
}

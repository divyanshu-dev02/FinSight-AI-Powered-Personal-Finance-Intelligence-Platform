import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, ChartNoAxesColumnIncreasing, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type ApiResponse } from '@/lib/api';
import { SpendingMix, type SpendingCategory, type SpendingMerchant } from './SpendingMix';

type SpendingTotal = { bucket: string; currency: string; amount: number };
type SpendingTrendData = { buckets: SpendingTotal[]; totals: Record<string, number>; categories: SpendingCategory[]; merchants: SpendingMerchant[] };
type DateRange = { start: string; end: string };
const presets = [1, 3, 6];
const dayMs = 86_400_000;
const shortMonth = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const fullMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const day = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

function monthOffset(key: string, offset: number) {
  const date = day(`${key}-01`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date;
}

function lastDay(key: string) {
  return iso(new Date(monthOffset(key, 1).getTime() - dayMs));
}

function presetRange(month: string, months: number): DateRange {
  return { start: iso(monthOffset(month, 1 - months)), end: lastDay(month) };
}

function chartBuckets(range: DateRange, daily: boolean) {
  const buckets: Array<DateRange & { key: string; label: string; title: string }> = [];
  for (let start = range.start; start <= range.end;) {
    const date = day(start);
    const month = start.slice(0, 7);
    const monthEnd = lastDay(month);
    const end = daily ? start : range.end < monthEnd ? range.end : monthEnd;
    const full = !daily && start === `${month}-01` && end === monthEnd;
    buckets.push({
      start, end, key: daily ? start : month,
      label: daily
        ? (date.getUTCDate() === 1 ? shortMonth.format(date) : String(date.getUTCDate()))
        : shortMonth.format(date),
      title: full ? fullMonth.format(date) : start === end ? fullDate.format(date)
        : `${fullDate.format(date)} to ${fullDate.format(day(end))}`,
    });
    if (end === range.end) break;
    start = iso(new Date(day(end).getTime() + dayMs));
  }
  return buckets;
}

function chartStep(peak: number) {
  if (peak <= 0) return 1;
  const target = peak / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find(candidate => candidate * magnitude >= target) ?? 10;
  return step * magnitude;
}

function CumulativeShape({ values, ceiling }: { values: number[]; ceiling: number }) {
  const point = (x: number, value: number) => `${x}% ${100 - value / ceiling * 100}%`;
  const points = [
    point(0, 0),
    ...values.map((value, index) => point((index + 0.5) / values.length * 100, value)),
    point(100, values[values.length - 1] ?? 0),
  ];
  const line = [...points, ...points.slice().reverse().map(coordinate => {
    const [x, y] = coordinate.split(' ');
    return `${x} calc(${y} + 2px)`;
  })];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-32 sm:h-40">
      <div className="absolute inset-0 bg-blue-50" style={{ clipPath: `polygon(${points.join(', ')}, 100% 100%, 0 100%)` }} />
      <div className="absolute inset-0 bg-blue-600" style={{ clipPath: `polygon(${line.join(', ')})` }} />
    </div>
  );
}

export function SpendingTrend({ month, currency, userId }: { month: string; currency: string; userId?: string }) {
  const [months, setMonths] = useState(6);
  const [chart, setChart] = useState<'bars' | 'cumulative'>('bars');
  const [showCustom, setShowCustom] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange>();
  const [dateError, setDateError] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>();
  const [selectedBucket, setSelectedBucket] = useState<string>();
  const range = customRange ?? presetRange(month, months);
  const trend = useQuery({
    queryKey: ['dashboard-summary', 'spending-trend', range.start, range.end, userId],
    enabled: !!userId,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<ApiResponse<SpendingTrendData>>('/dashboard/spending-trend', {
        params: { month, start: range.start, end: range.end }, signal,
      });
      return { range, ...data.data };
    },
  });
  const displayedRange = trend.data?.range ?? range;
  const daily = (day(displayedRange.end).getTime() - day(displayedRange.start).getTime()) / dayMs < 31;
  const totals = trend.data?.buckets ?? [];
  const currencies = [...new Set([currency, ...totals.map(row => row.currency)])].sort();
  const activeCurrency = selectedCurrency && currencies.includes(selectedCurrency) ? selectedCurrency : currency;
  const formatter = useMemo(() => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: activeCurrency, maximumFractionDigits: 4,
  }), [activeCurrency]);
  const compact = useMemo(() => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: activeCurrency, notation: 'compact', maximumFractionDigits: 1,
  }), [activeCurrency]);
  const barLabel = (amount: number) => amount < 1000 ? formatter.format(amount) : compact.format(amount);
  const amounts = new Map(totals.filter(row => row.currency === activeCurrency).map(row => [row.bucket, row.amount]));
  const rangeAmount = trend.data?.totals[activeCurrency] ?? 0;
  const periodBuckets = chartBuckets(displayedRange, daily);
  let cumulativeUnits = 0;
  const buckets = periodBuckets.map((entry, index) => {
    const amount = amounts.get(entry.key) ?? 0;
    // PostgreSQL stores ledger amounts to four decimal places.
    cumulativeUnits += Math.round(amount * 10_000);
    const cumulative = index === periodBuckets.length - 1 ? rangeAmount : cumulativeUnits / 10_000;
    return { ...entry, amount, cumulative };
  });
  const active = buckets.find(entry => entry.key === selectedBucket) ?? buckets[buckets.length - 1]!;
  const peak = chart === 'cumulative' ? rangeAmount : Math.max(0, ...buckets.map(entry => entry.amount));
  const step = chartStep(peak);
  const ceiling = step * 3;
  const dense = daily && buckets.length > 12;
  const rangeLabel = `${fullDate.format(day(displayedRange.start))} – ${fullDate.format(day(displayedRange.end))}`;
  const fullMonthSelected = !daily && active.start === `${active.key}-01` && active.end === lastDay(active.key);
  const rangeFilters = new URLSearchParams({ currency: activeCurrency, spendingStart: displayedRange.start, spendingEnd: displayedRange.end });
  const filters = new URLSearchParams({ currency: activeCurrency, ...(fullMonthSelected
    ? { spendingMonth: active.key } : { spendingStart: active.start, spendingEnd: active.end }) });

  return (
    <section className="dashboard-panel" aria-labelledby="spending-trend-title">
      <header className="panel-heading">
        <div><h2 id="spending-trend-title">Spending trend</h2><p>{rangeLabel} · {trend.isPlaceholderData ? 'Updating…' : `${daily ? 'Daily' : 'Monthly'} spending`}</p></div>
        {trend.isSuccess && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Currency
            <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={activeCurrency}
              onChange={event => setSelectedCurrency(event.target.value)}>
              {currencies.map(code => <option key={code}>{code}</option>)}
            </select>
          </label>
        )}
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Spending date range">
          {presets.map(count => (
            <button key={count} type="button" aria-pressed={!showCustom && months === count}
              className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 hover:bg-slate-50 aria-pressed:border-blue-200 aria-pressed:bg-blue-50 aria-pressed:font-semibold aria-pressed:text-blue-800"
              onClick={() => {
                setMonths(count);
                setShowCustom(false);
                setCustomRange(undefined);
                setDateError(false);
                setSelectedBucket(undefined);
              }}>{count} {count === 1 ? 'month' : 'months'}</button>
          ))}
          <button type="button" aria-pressed={showCustom} className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 hover:bg-slate-50 aria-pressed:border-blue-200 aria-pressed:bg-blue-50 aria-pressed:font-semibold aria-pressed:text-blue-800"
            onClick={() => setShowCustom(true)}>Custom</button>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Spending chart type">
          <button type="button" aria-pressed={chart === 'bars'} onClick={() => setChart('bars')}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 aria-pressed:bg-white aria-pressed:text-blue-800 aria-pressed:shadow-sm">
            <ChartNoAxesColumnIncreasing size={15} aria-hidden="true" /> Bars
          </button>
          <button type="button" aria-pressed={chart === 'cumulative'} onClick={() => setChart('cumulative')}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 aria-pressed:bg-white aria-pressed:text-blue-800 aria-pressed:shadow-sm">
            <TrendingUp size={15} aria-hidden="true" /> Running total
          </button>
        </div>
      </div>
      {showCustom && (
        <form className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3" onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const start = String(fields.get('start') ?? '');
          const end = String(fields.get('end') ?? '');
          const days = (day(end).getTime() - day(start).getTime()) / dayMs + 1;
          if (![start, end].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || !(days >= 1 && days <= 366)) {
            setDateError(true);
            return;
          }
          setDateError(false);
          if (start !== range.start || end !== range.end) {
            setCustomRange({ start, end });
            setSelectedBucket(undefined);
          }
        }}>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Start date
            <input required type="date" name="start" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" defaultValue={range.start} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">End date
            <input required type="date" name="end" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" defaultValue={range.end} />
          </label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Apply dates</button>
          {dateError && <p className="w-full text-xs text-rose-700" role="status">Choose dates in order, with a range of up to 366 days.</p>}
        </form>
      )}

      {trend.isPending && <p role="status" className="panel-empty">Loading spending trend…</p>}
      {trend.isError && <p role="alert" className="panel-empty">Couldn’t load the spending trend. <button type="button" className="dashboard-text-button" onClick={() => void trend.refetch()}>Retry</button></p>}
      {trend.isSuccess && <div aria-busy={trend.isPlaceholderData}>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div aria-live="polite">
            <p className="text-xs font-semibold text-slate-600">Total spent · {activeCurrency}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{formatter.format(rangeAmount)}</p>
          </div>
          <Link className="panel-link" to={`/transactions?${rangeFilters}`}>View range transactions <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="relative pl-12 pt-6" style={{ minWidth: `${48 + buckets.length * (dense ? 16 : 48)}px` }}>
            {peak === 0 && (
              <p className="pointer-events-none absolute inset-x-12 top-16 z-10 mx-auto w-fit rounded-md bg-white px-2 py-1 text-center text-sm text-slate-600">
                No spending in {activeCurrency} for this range.
              </p>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-6 h-32 sm:h-40" aria-hidden="true">
              {[3, 2, 1, 0].map(tick => (
                <div key={tick} className="absolute inset-x-0 flex items-center gap-2"
                  style={{ top: `${(3 - tick) / 3 * 100}%`, transform: 'translateY(-50%)' }}>
                  <span className="w-10 shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-500">
                    {tick * step < 1 ? formatter.format(tick * step) : compact.format(tick * step)}
                  </span>
                  <span className={`h-px flex-1 ${tick === 0 ? 'bg-slate-300' : 'bg-slate-100'}`} />
                </div>
              ))}
            </div>
            <div className="relative grid" role="group" aria-label={chart === 'cumulative' ? 'Cumulative spending' : daily ? 'Daily spending' : 'Monthly spending'}
              style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
              {chart === 'cumulative' && peak > 0 && <CumulativeShape values={buckets.map(entry => entry.cumulative)} ceiling={ceiling} />}
              {buckets.map((entry, index) => {
                const selected = entry.key === active.key;
                const labelDate = !dense || selected || index === 0 || index === buckets.length - 1 || index % 5 === 0;
                const labelAmount = !dense || selected;
                const amountLabel = `${formatter.format(entry.amount)} ${activeCurrency}`;
                const pointLabel = chart === 'cumulative' ? `${amountLabel} spent, ${formatter.format(entry.cumulative)} running total` : amountLabel;
                return (
                  <button key={entry.key} type="button" aria-pressed={selected}
                    aria-label={`${entry.title}, ${pointLabel}`}
                    title={`${entry.title} · ${pointLabel}`}
                    className="group flex min-w-0 flex-col items-center rounded-md text-xs font-medium text-slate-600 focus-visible:z-10"
                    onClick={() => setSelectedBucket(entry.key)}>
                    <span className="relative block h-32 w-full sm:h-40" aria-hidden="true">
                      {chart === 'cumulative' && entry.cumulative > 0 && (
                        <span className={`absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border-2 bg-white motion-safe:transition-[bottom] motion-safe:duration-300 ${selected ? 'h-3 w-3 border-blue-800' : dense ? 'h-1.5 w-1.5 border-blue-600' : 'h-2 w-2 border-blue-600'}`}
                          style={{ bottom: `${entry.cumulative / ceiling * 100}%` }}>
                          {selected && <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-white px-1 text-[10px] font-semibold tabular-nums text-blue-900 sm:text-xs">
                            {barLabel(entry.cumulative)}
                          </span>}
                        </span>
                      )}
                      {chart === 'bars' && entry.amount > 0 && (
                        <span data-spending-bar className={`absolute bottom-0 left-1/2 w-[56%] max-w-14 -translate-x-1/2 rounded-t-md motion-safe:transition-[height,background-color] motion-safe:duration-300 ${selected ? 'bg-blue-700' : 'bg-blue-500 group-hover:bg-blue-600'}`}
                          style={{ height: `${entry.amount / ceiling * 100}%` }}>
                          {labelAmount && <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-slate-800 sm:text-xs">
                            {barLabel(entry.amount)}
                          </span>}
                        </span>
                      )}
                    </span>
                    <span className={`mt-2 min-h-6 rounded-md px-0.5 py-0.5 tabular-nums ${selected ? 'font-bold text-blue-800' : ''}`} aria-hidden="true">
                      {labelDate ? entry.label : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
          <p aria-live="polite" className="text-sm text-slate-700">
            {active.title} · <strong className="tabular-nums text-slate-900">{formatter.format(active.amount)}</strong>{chart === 'cumulative' && (
              <span className="block text-xs text-slate-600">Running total through this period: {formatter.format(active.cumulative)}</span>
            )}
          </p>
          <Link className="panel-link" to={`/transactions?${filters}`}>{chart === 'bars' ? 'View selected bar transactions' : 'View period transactions'} <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className="mt-2 text-xs text-slate-500">Active accounts only. Transfers and credits are excluded.</p>
        <SpendingMix categories={trend.data.categories?.filter(category => category.currency === activeCurrency) ?? []}
          merchants={trend.data.merchants?.filter(merchant => merchant.currency === activeCurrency) ?? []}
          total={rangeAmount} formatter={formatter} filters={rangeFilters} />
      </div>}
    </section>
  );
}

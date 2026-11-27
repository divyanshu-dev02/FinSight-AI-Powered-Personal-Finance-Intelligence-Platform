import { useState, type FormEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Category, FinancialAccount } from '@/types/finance';

import { transactionFilterKeys, type TransactionFilterValues } from './transactionFilterValues';

const field = 'min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-900';
const label = 'grid min-w-0 gap-1 text-xs font-semibold text-slate-700';

export function TransactionFilters({ values, accounts, categories, spendingView, onApply, onClear }: {
  values: TransactionFilterValues;
  accounts: FinancialAccount[];
  categories: Category[];
  spendingView: boolean;
  onApply: (filters: TransactionFilterValues) => void;
  onClear: () => void;
}) {
  const [error, setError] = useState('');
  const applied = transactionFilterKeys.filter(key => Boolean(values[key])).length;
  const formKey = JSON.stringify(values);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = Object.fromEntries(transactionFilterKeys.map(key => [
      key, String(form.get(key) ?? values[key]).trim(),
    ])) as TransactionFilterValues;
    if (next.from && next.to && next.from > next.to) {
      setError('End date must be on or after start date.');
      return;
    }
    setError('');
    onApply(next);
  }

  return (
    <details open={applied > 0 || undefined} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal size={17} aria-hidden="true" /> Filters
        {applied > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{applied} active</span>}
      </summary>
      <form key={formKey} className="mt-3 space-y-3 border-t border-slate-100 pt-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className={label}>Search transactions
            <input name="search" type="search" maxLength={120} className={field} defaultValue={values.search}
              placeholder="Description, merchant, or category" />
          </label>
          {values.merchant && <label className={label}>Merchant (exact)
            <input name="merchant" type="text" maxLength={100} className={field} defaultValue={values.merchant} />
          </label>}
          <label className={label}>Account
            <select name="accountId" className={field} defaultValue={values.accountId}>
              <option value="">All accounts</option>
              {values.accountId && !accounts.some(account => account.id === values.accountId) && (
                <option value={values.accountId}>Selected account</option>
              )}
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.active ? '' : ' (archived)'}</option>)}
            </select>
          </label>
          <label className={label}>Category
            <select name="categoryId" className={field} defaultValue={values.categoryId}>
              <option value="">All categories</option>
              {values.categoryId && !categories.some(category => category.id === values.categoryId) && (
                <option value={values.categoryId}>Selected category</option>
              )}
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          {!spendingView && <>
            <label className={label}>Transaction type
              <select name="type" className={field} defaultValue={values.type}>
                <option value="">All types</option>
                <option value="EXPENSE">Expenses</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfers</option>
              </select>
            </label>
            <label className={label}>From date
              <input type="date" name="from" className={field} defaultValue={values.from} />
            </label>
            <label className={label}>To date
              <input type="date" name="to" className={field} defaultValue={values.to} />
            </label>
          </>}
        </div>
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="min-h-10 rounded-lg bg-blue-700 px-3.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <button type="reset" className="min-h-10 px-2 text-sm font-semibold text-slate-700 hover:underline" onClick={() => {
            setError('');
            onClear();
          }}>Clear filters</button>
        </div>
      </form>
    </details>
  );
}

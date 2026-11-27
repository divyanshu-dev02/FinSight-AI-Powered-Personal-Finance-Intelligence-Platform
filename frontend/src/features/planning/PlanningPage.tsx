import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { api, type ApiResponse } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Category, FinancialAccount } from '@/types/finance';
import {
  planningError, usePlanning, type Budget, type Candidate, type Commitment, type Goal, type Occurrence,
} from './planning';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const action = 'rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50';

export function PlanningPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedMonth = params.get('month') ?? undefined;
  const overview = usePlanning(user?.id ?? '', requestedMonth);
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<ApiResponse<Category[]>>('/categories')).data.data,
  });
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<ApiResponse<FinancialAccount[]>>('/accounts')).data.data,
  });
  const [budget, setBudget] = useState<Budget | 'new'>();
  const [goal, setGoal] = useState<Goal | 'new'>();
  const [commitment, setCommitment] = useState<Commitment | 'new'>();
  const [occurrence, setOccurrence] = useState<Occurrence>();

  if (overview.isPending) return <p role="status">Loading your plan…</p>;
  if (overview.isError) return <p role="alert">Could not load your plan. <button type="button" className={action} onClick={() => void overview.refetch()}>Retry</button></p>;

  const data = overview.data;
  const defaultCurrency = user?.baseCurrency ?? 'INR';
  const editBudget = budget === 'new' ? undefined : budget;
  const editGoal = goal === 'new' ? undefined : goal;
  const editCommitment = commitment === 'new' ? undefined : commitment;
  const expenseCategories = categories?.filter(category => category.type === 'EXPENSE' && category.active);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header><h1 className="page-title">Planning</h1><p className="mt-1 text-sm text-slate-600">Manage monthly budgets, savings goals, and recurring payments.</p></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="plan-budgets">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="plan-budgets" className="text-lg font-bold">Monthly budgets</h2>
            <p className="text-sm text-slate-600">Spending reflects recorded expenses from active accounts.</p>
          </div>
          <button type="button" className={action} onClick={() => setBudget('new')}>Add budget</button>
        </div>
        <label className="mt-3 block max-w-52 text-sm font-medium">
          Budget month
          <input type="month" className={field} value={data.month} onChange={event => {
            if (event.target.value) {
              setBudget(undefined);
              setParams({ month: event.target.value });
            }
          }} />
        </label>
        {budget && (
          <Editor key={editBudget?.id ?? 'new-budget'} title={editBudget ? 'Edit budget' : 'New budget'}
            resource="budgets" id={editBudget?.id} close={() => setBudget(undefined)}
            payload={form => ({ categoryId: form.get('categoryId'), month: data.month, currency: currency(form), amount: form.get('amount') })}>
            <label className="text-sm">Expense category
              <select name="categoryId" required className={field} defaultValue={editBudget?.categoryId ?? ''}>
                <option value="">Select category</option>
                {expenseCategories?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <CurrencyField value={editBudget?.currency ?? defaultCurrency} />
            <MoneyField label="Budget limit" name="amount" value={editBudget?.amount} />
          </Editor>
        )}
        <ul className="mt-3 divide-y divide-slate-100">
          {data.budgets.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.categoryName} <span className="text-xs text-slate-500">{item.currency}</span></p>
                <p className="text-sm text-slate-700">{formatCurrency(item.spent, item.currency)} of {formatCurrency(item.amount, item.currency)} spent
                  {item.spent > item.amount && <span className="text-red-700"> · Over budget</span>}
                </p>
              </div>
              <button type="button" className={action} onClick={() => setBudget(item)}>Edit <span className="sr-only">{item.categoryName} budget</span></button>
            </li>
          ))}
        </ul>
        {!data.budgets.length && <p className="text-sm text-slate-600">No budgets for this month.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="plan-goals">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="plan-goals" className="text-lg font-bold">Savings goals</h2>
            <p className="text-sm text-slate-600">Update your saved amount as you make progress.</p>
          </div>
          <button type="button" className={action} onClick={() => setGoal('new')}>Add goal</button>
        </div>
        {goal && (
          <Editor key={editGoal?.id ?? 'new-goal'} resource="goals" id={editGoal?.id}
            title={editGoal ? 'Edit savings goal' : 'New savings goal'} close={() => setGoal(undefined)}
            payload={form => ({
              name: form.get('name'), currency: currency(form), targetAmount: form.get('targetAmount'),
              savedAmount: form.get('savedAmount'), targetDate: form.get('targetDate') || null,
            })}>
            <NameField label="Goal name" name="name" value={editGoal?.name} />
            <CurrencyField value={editGoal?.currency ?? defaultCurrency} />
            <MoneyField label="Target amount" name="targetAmount" value={editGoal?.targetAmount} />
            <MoneyField label="Amount saved" name="savedAmount" value={editGoal?.savedAmount ?? 0} allowZero />
            <label className="text-sm">Target date (optional)<input className={field} type="date" name="targetDate" defaultValue={editGoal?.targetDate} /></label>
          </Editor>
        )}
        <ul className="mt-3 divide-y divide-slate-100">
          {data.goals.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.name}</p>
                <p className="text-sm text-slate-700">{formatCurrency(item.savedAmount, item.currency)} of {formatCurrency(item.targetAmount, item.currency)} saved
                  {item.targetDate && <> · {formatDate(item.targetDate)}</>}
                </p>
              </div>
              <button type="button" className={action} onClick={() => setGoal(item)}>Edit <span className="sr-only">{item.name} goal</span></button>
            </li>
          ))}
        </ul>
        {!data.goals.length && <p className="text-sm text-slate-600">No savings goals yet.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="plan-commitments">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="plan-commitments" className="text-lg font-bold">Recurring bills and income</h2>
            <p className="text-sm text-slate-600">Add confirmed schedules and link a transaction once it posts.</p>
          </div>
          <button type="button" className={action} onClick={() => setCommitment('new')}>Add schedule</button>
        </div>
        {commitment && (
          <Editor key={editCommitment?.id ?? 'new-commitment'} resource="commitments" id={editCommitment?.id}
            title={editCommitment ? 'Edit recurring schedule' : 'New recurring schedule'} close={() => setCommitment(undefined)}
            payload={form => ({
              name: form.get('name'), accountId: form.get('accountId'), direction: form.get('direction'),
              amount: form.get('amount'), frequency: form.get('frequency'), firstDate: form.get('firstDate'),
              active: form.has('active'),
            })}>
            <NameField label="Schedule name" name="name" value={editCommitment?.name} />
            <label className="text-sm">Account
              <select className={field} name="accountId" required defaultValue={editCommitment?.accountId ?? ''}>
                <option value="">Select account</option>
                {editCommitment && !accounts?.some(account => account.id === editCommitment.accountId) && (
                  <option value={editCommitment.accountId}>{editCommitment.accountName} · {editCommitment.currency}</option>
                )}
                {accounts?.filter(account => account.active || account.id === editCommitment?.accountId)
                  .map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
              </select>
            </label>
            <label className="text-sm">Type
              <select className={field} name="direction" defaultValue={editCommitment?.direction ?? 'DEBIT'}>
                <option value="DEBIT">Bill or expense</option>
                <option value="CREDIT">Income</option>
              </select>
            </label>
            <MoneyField label="Expected amount in account currency" name="amount" value={editCommitment?.amount} />
            <label className="text-sm">Repeats
              <select className={field} name="frequency" defaultValue={editCommitment?.frequency ?? 'MONTHLY'}>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label className="text-sm">First due date<input type="date" name="firstDate" className={field} required defaultValue={editCommitment?.firstDate ?? data.today} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editCommitment?.active ?? true} /> Active schedule</label>
          </Editor>
        )}
        <ul className="mt-3 divide-y divide-slate-100">
          {data.commitments.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.name}</p>
                <p className="text-sm text-slate-700">{formatCurrency(item.amount, item.currency)} {item.frequency.toLowerCase()} · {item.accountName}
                  {(!item.active || !item.accountActive) && <> · Paused</>}
                </p>
              </div>
              <button type="button" className={action} onClick={() => setCommitment(item)}>Edit <span className="sr-only">{item.name} schedule</span></button>
            </li>
          ))}
        </ul>
        {!data.commitments.length && <p className="text-sm text-slate-600">No recurring schedules yet.</p>}

        {data.occurrences.length > 0 && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold">Scheduled and posted</h3>
            <p className="text-sm text-slate-600">Due in the last 7 days or through {formatDate(data.through)}.</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {data.occurrences.map(item => {
                const key = `${item.commitmentId}/${item.dueDate}`;
                const open = occurrence?.commitmentId === item.commitmentId && occurrence.dueDate === item.dueDate;
                return (
                  <li key={key} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{item.name} <span className="text-xs text-slate-500">{item.transactionId ? 'Posted' : 'Expected'}</span></p>
                        <p className="text-sm text-slate-700">{formatDate(item.dueDate)} · {item.direction === 'DEBIT' ? 'Bill' : 'Income'} · {formatCurrency(item.amount, item.currency)} scheduled</p>
                      </div>
                      <div className="flex flex-wrap items-center">
                        {item.transactionId && <Link className={action} to={`/transactions?evidence=${item.transactionId}`}>View transaction</Link>}
                        <button type="button" className={action} onClick={() => setOccurrence(open ? undefined : item)}>
                          {item.transactionId ? 'Unlink' : 'Link transaction'}
                        </button>
                      </div>
                    </div>
                    {open && <PostingEditor key={key} occurrence={item} userId={user?.id ?? ''} close={() => setOccurrence(undefined)} />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function NameField({ label, name, value }: { label: string; name: string; value?: string }) {
  return <label className="text-sm">{label}<input className={field} name={name} required maxLength={100} defaultValue={value} /></label>;
}

function MoneyField({ label, name, value, allowZero = false }: { label: string; name: string; value?: number; allowZero?: boolean }) {
  return <label className="text-sm">{label}<input className={field} type="number" inputMode="decimal" name={name}
    required min={allowZero ? 0 : 0.0001} step="0.0001" defaultValue={value} /></label>;
}

function CurrencyField({ value }: { value: string }) {
  return <label className="text-sm">Currency<input className={field} name="currency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={value} /></label>;
}

function currency(form: FormData) {
  return String(form.get('currency')).toUpperCase();
}

function Editor({ title, resource, id, close, children, payload }: {
  title: string; resource: 'budgets' | 'goals' | 'commitments'; id?: string; close: () => void;
  children: ReactNode; payload: (form: FormData) => object;
}) {
  const queryClient = useQueryClient();
  const endpoint = id ? `/planning/${resource}/${id}` : `/planning/${resource}`;
  const finish = () => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-summary', 'planning'] });
    close();
  };
  const write = useMutation({
    mutationFn: async (data: object) => id ? api.put(endpoint, data) : api.post(endpoint, data),
    onSuccess: finish,
  });
  const remove = useMutation({ mutationFn: async () => api.delete(endpoint), onSuccess: finish });
  const busy = write.isPending || remove.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    write.mutate(payload(new FormData(event.currentTarget)));
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-slate-50 p-3 sm:p-4">
      <h3 className="font-semibold">{title}</h3>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{children}</fieldset>
      {(write.error || remove.error) && <p role="alert" className="text-sm text-red-700">{planningError(write.error ?? remove.error)}</p>}
      <div className="flex flex-wrap gap-1">
        <button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
        <button type="button" className={action} disabled={busy} onClick={close}>Cancel</button>
        {id && resource !== 'commitments' && (
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-red-700" disabled={busy}
            onClick={() => { if (window.confirm('Remove this item from your plan?')) remove.mutate(); }}>Remove</button>
        )}
      </div>
    </form>
  );
}

function PostingEditor({ occurrence, userId, close }: { occurrence: Occurrence; userId: string; close: () => void }) {
  const queryClient = useQueryClient();
  const endpoint = `/planning/commitments/${occurrence.commitmentId}/occurrences/${occurrence.dueDate}`;
  const candidates = useQuery({
    queryKey: ['planning-posting-candidates', userId, endpoint],
    enabled: !occurrence.transactionId,
    queryFn: async () => (await api.get<ApiResponse<Candidate[]>>(`${endpoint}/candidates`)).data.data,
  });
  const save = useMutation({
    mutationFn: async (transactionId?: string) => transactionId
      ? api.put(`${endpoint}/posting`, { transactionId })
      : api.delete(`${endpoint}/posting`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary', 'planning'] });
      void queryClient.invalidateQueries({ queryKey: ['planning-posting-candidates', userId] });
      close();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = new FormData(event.currentTarget).get('transactionId');
    if (occurrence.transactionId || typeof id === 'string' && id) {
      save.mutate(typeof id === 'string' && id ? id : undefined);
    }
  };

  return (
    <form className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm" onSubmit={submit}>
      {occurrence.transactionId ? <p>Remove the link so this occurrence appears as expected again?</p> : (
        <label>Posted transaction
          <select name="transactionId" className={field} required disabled={!candidates.data?.length || save.isPending}>
            <option value="">Select a transaction</option>
            {candidates.data?.map(transaction => <option key={transaction.id} value={transaction.id}>
              {formatDate(transaction.date)} · {transaction.description} · {formatCurrency(transaction.amount, occurrence.currency)}
            </option>)}
          </select>
        </label>
      )}
      {!occurrence.transactionId && candidates.isPending && <p role="status">Loading recorded transactions…</p>}
      {candidates.isError && <p role="alert">Could not load transactions. <button type="button" className={action} onClick={() => void candidates.refetch()}>Retry</button></p>}
      {candidates.data?.length === 0 && <p>No unlinked transactions from this account and direction within 7 days of the due date.</p>}
      {save.error && <p role="alert" className="text-red-700">{planningError(save.error)}</p>}
      <div>
        <button type="submit" className={action} disabled={save.isPending || (!occurrence.transactionId && !candidates.data?.length)}>
          {occurrence.transactionId ? 'Confirm unlink' : 'Confirm link'}
        </button>
        <button type="button" className={action} disabled={save.isPending} onClick={close}>Cancel</button>
      </div>
    </form>
  );
}

import { ArrowLeftRight, ChevronDown, Download, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiResponse } from '@/lib/api';
import { Transaction, FinancialAccount, Category } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { TransactionAmount } from '@/components/TransactionAmount';
import { StatementImportModal } from './StatementImportModal';
import { TransactionFilters } from './TransactionFilters';
import { transactionFilterKeys, type TransactionFilterValues } from './transactionFilterValues';

// Schema for manual expense/income transaction
const transactionSchema = z.object({
  accountId: z.string().min(1, 'Please select an account'),
  categoryId: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  direction: z.enum(['DEBIT', 'CREDIT']),
  description: z.string().min(1, 'Description is required').max(255),
  merchant: z.string().max(100).optional(),
  transactionDate: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

// Schema for first-class transfer
const transferSchema = z
  .object({
    sourceAccountId: z.string().min(1, 'Select source account'),
    destinationAccountId: z.string().min(1, 'Select destination account'),
    amount: z.coerce.number().positive('Transfer amount must be greater than zero'),
    transactionDate: z.string().min(1, 'Date is required'),
    description: z.string().max(255).optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: 'Destination account cannot be the same as source account',
    path: ['destinationAccountId'],
  });

type TransferFormData = z.infer<typeof transferSchema>;

interface PaginatedData<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const spendingMonth = params.get('spendingMonth');
  const spendingCurrency = params.get('currency');
  const spendingStart = params.get('spendingStart');
  const spendingEnd = params.get('spendingEnd');
  const spendingView = spendingMonth !== null || spendingStart !== null || spendingEnd !== null;
  const evidenceId = params.get('evidence');
  const filters = Object.fromEntries(transactionFilterKeys.map(key => [key, params.get(key) ?? ''])) as TransactionFilterValues;
  const activeFilters = transactionFilterKeys.some(key => Boolean(filters[key]));
  const requestFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const evidence = useQuery({
    queryKey: ['transaction-evidence', evidenceId],
    enabled: !!evidenceId,
    queryFn: async ({ signal }) => {
      const response = await api.get<ApiResponse<Transaction>>(
        `/transactions/${encodeURIComponent(evidenceId ?? '')}`, { signal }
      );
      return response.data.data;
    },
  });
  const queryClient = useQueryClient();
  const addMenu = useRef<HTMLDetailsElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const [includeArchived, setIncludeArchived] = useState(false);

  // 1. Fetch transactions (defaults to active accounts only)
  const { data: transactionsPage, isLoading, isError, refetch } = useQuery({
    queryKey: ['transactions', page, includeArchived, spendingMonth, spendingStart, spendingEnd, spendingCurrency, requestFilters],
    enabled: !evidenceId,
    queryFn: async ({ signal }) => {
      const res = await api.get<ApiResponse<PaginatedData<Transaction>>>('/transactions', {
        params: {
          page, size: 15, includeArchived, ...requestFilters,
          ...(spendingView ? { spendingMonth, spendingStart, spendingEnd, currency: spendingCurrency } : {}),
        },
        signal,
      });
      return res.data.data;
    },
  });

  // 2. Fetch accounts for dropdowns
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialAccount[]>>('/accounts');
      return res.data.data;
    },
  });

  const { data: allFilterAccounts } = useQuery({
    queryKey: ['accounts', 'including-archived'],
    enabled: includeArchived && !spendingView && !evidenceId,
    queryFn: async ({ signal }) => (await api.get<ApiResponse<FinancialAccount[]>>('/accounts', {
      params: { includeArchived: true }, signal,
    })).data.data,
  });

  // 3. Fetch categories for dropdowns
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Category[]>>('/categories');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const payload = {
        ...data,
        categoryId: data.categoryId || null,
        merchant: data.merchant || null,
      };
      const res = await api.post<ApiResponse<Transaction>>('/transactions', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      setIsModalOpen(false);
      reset();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(error.response?.data?.error?.message || 'Failed to create transaction');
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (data: TransferFormData) => {
      const res = await api.post<ApiResponse<Transaction>>('/transactions/transfer', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      setIsTransferModalOpen(false);
      resetTransfer();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(error.response?.data?.error?.message || 'Failed to complete transfer');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      direction: 'DEBIT',
      transactionDate: new Date().toISOString().split('T')[0],
    },
  });

  const {
    register: registerTransfer,
    handleSubmit: handleSubmitTransfer,
    reset: resetTransfer,
    formState: { errors: transferErrors, isSubmitting: isSubmittingTransfer },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = (data: TransactionFormData) => {
    setErrorMessage(null);
    createMutation.mutate(data);
  };

  const onTransferSubmit = (data: TransferFormData) => {
    setErrorMessage(null);
    transferMutation.mutate(data);
  };

  // Export functions
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const res = await api.get('/transactions/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `finsight-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to export transactions.');
    } finally {
      setIsExporting(false);
    }
  };

  const transactions = transactionsPage?.content ?? [];

  function applyFilters(values?: TransactionFilterValues) {
    setPage(0);
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const key of transactionFilterKeys) {
        const value = values?.[key];
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  if (evidenceId) {
    const transaction = evidence.data;
    return (
      <section className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Transaction details</h2>
        {evidence.isPending && <LoadingSpinner />}
        {evidence.isError && <p role="alert">This transaction is unavailable.</p>}
        {transaction && (
          <>
            <p>{transaction.merchant || transaction.description || transaction.accountName}</p>
            <p>{formatDate(transaction.transactionDate)} · {formatCurrency(transaction.amount, transaction.currency)}</p>
            <p>{transaction.accountName}{transaction.categoryName && ` · ${transaction.categoryName}`}</p>
          </>
        )}
        <Link to="/transactions" className="text-blue-700 underline">All transactions</Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-gray-200 pb-5 gap-4">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            View, search, filter, and track all your financial inflows, outflows, transfers, and statement imports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <details ref={addMenu} className="relative">
            <summary className="flex min-h-9 list-none cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 [&::-webkit-details-marker]:hidden">
              <Plus size={16} aria-hidden="true" /> Add Transaction <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="absolute left-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <button type="button" onClick={() => {
                if (addMenu.current) addMenu.current.open = false;
                reset();
                setErrorMessage(null);
                setIsModalOpen(true);
              }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50">
                <Plus size={16} aria-hidden="true" /> Record income or expense
              </button>
              <button type="button" onClick={() => {
                if (addMenu.current) addMenu.current.open = false;
                resetTransfer();
                setErrorMessage(null);
                setIsTransferModalOpen(true);
              }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <ArrowLeftRight size={16} aria-hidden="true" /> Record a transfer
              </button>
            </div>
          </details>

          <button type="button" disabled={isExporting} onClick={handleExportCsv} title="Download all transactions"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download size={16} aria-hidden="true" />{isExporting ? 'Exporting…' : 'Export CSV'}
          </button>

          {/* Import Statement */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs font-semibold text-blue-700 shadow-xs hover:bg-blue-100 transition-all cursor-pointer"
          >
            <Upload size={16} aria-hidden="true" />
            <span>Import Statement</span>
          </button>

        </div>
      </div>

      <TransactionFilters values={filters} spendingView={spendingView}
        accounts={(includeArchived && !spendingView ? allFilterAccounts ?? accounts : accounts) ?? []}
        categories={categories ?? []} onApply={applyFilters} onClear={() => applyFilters()} />
      {!spendingView && (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={includeArchived} onChange={event => {
            setIncludeArchived(event.target.checked);
            setPage(0);
          }} className="h-4 w-4 rounded border-slate-300 accent-blue-700" />
          Include archived accounts
        </label>
      )}

      {spendingView && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-800">
          <span>Expenses · {spendingMonth ?? (spendingStart === spendingEnd ? spendingStart : `${spendingStart} to ${spendingEnd}`)} · {spendingCurrency} · Active accounts</span>
          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => {
            setPage(0);
            setParams(current => {
              const next = new URLSearchParams(current);
              next.delete('spendingMonth');
              next.delete('spendingStart');
              next.delete('spendingEnd');
              next.delete('currency');
              return next;
            });
          }}>Clear spending filter</button>
        </div>
      )}

      {isError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          Couldn’t load transactions. <button type="button" className="font-semibold underline" onClick={() => void refetch()}>Retry</button>
        </p>
      ) : isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : transactions.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-6 py-3.5">Category / Type</th>
                <th className="px-6 py-3.5">Account</th>
                <th className="px-6 py-3.5 text-right">Amount</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 text-gray-600 text-xs font-medium">
                    {formatDate(tx.transactionDate)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{tx.description}</div>
                    {tx.merchant && <div className="text-xs text-gray-400 mt-0.5">{tx.merchant}</div>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                    {tx.isTransfer ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <span>⇄</span>
                        <span>Internal Transfer</span>
                      </span>
                    ) : tx.categoryName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-800">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: tx.categoryColor || '#6B7280' }}
                        />
                        {tx.categoryName}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs italic">Uncategorized</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-600 text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{tx.accountName}</span>
                      {tx.accountActive === false && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <TransactionAmount amount={tx.amount} currency={tx.currency} direction={tx.direction} isTransfer={tx.isTransfer} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Delete this transaction?')) {
                          deleteMutation.mutate(tx.id);
                        }
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination controls */}
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3.5 bg-gray-50/50">
            <span className="text-xs text-gray-500">
              Page {(transactionsPage?.number || 0) + 1} of {transactionsPage?.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={!transactionsPage || page >= transactionsPage.totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : spendingView || activeFilters ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p>No {spendingView ? 'expenses' : 'transactions'} match these filters.</p>
          {activeFilters && <button type="button" className="mt-2 font-semibold text-blue-700 hover:underline" onClick={() => applyFilters()}>Clear transaction filters</button>}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center bg-white">
          <div className="text-3xl mb-2">💸</div>
          <h3 className="text-sm font-semibold text-gray-900">No transactions recorded</h3>
          <p className="mt-1 text-sm text-gray-500">
            Import a bank statement (PDF, Excel, CSV) or manually record your first transaction.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50"
            >
              📥 Import Statement
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
            >
              + Record Transaction
            </button>
          </div>
        </div>
      )}

      {/* Manual Expense/Income Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Record Transaction</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 border border-red-200 text-xs text-red-700">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">Direction</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center rounded-xl border p-2.5 text-sm font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      value="DEBIT"
                      {...register('direction')}
                      className="mr-2 text-red-600"
                    />
                    Expense (Debit)
                  </label>
                  <label className="flex items-center justify-center rounded-xl border p-2.5 text-sm font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      value="CREDIT"
                      {...register('direction')}
                      className="mr-2 text-emerald-600"
                    />
                    Income (Credit)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Financial Account</label>
                <select
                  {...register('accountId')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select an account</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                    </option>
                  ))}
                </select>
                {errors.accountId && (
                  <p className="mt-1 text-xs text-red-600">{errors.accountId.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register('amount')}
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {errors.amount && (
                    <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Date</label>
                  <input
                    type="date"
                    {...register('transactionDate')}
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {errors.transactionDate && (
                    <p className="mt-1 text-xs text-red-600">{errors.transactionDate.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Category (Optional)</label>
                <select
                  {...register('categoryId')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Uncategorized</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Grocery Restock"
                  {...register('description')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Merchant / Payee (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Supermarket, Netflix, Employer"
                  {...register('merchant')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⇄</span>
                <h3 className="text-lg font-bold text-gray-900">Record a transfer</h3>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Log a transfer you already made between your own accounts. FinSight excludes it from income and spending totals.
            </p>

            {errorMessage && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 border border-red-200 text-xs text-red-700">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmitTransfer(onTransferSubmit)} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">From Account (Source)</label>
                <select
                  {...registerTransfer('sourceAccountId')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select source account</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                    </option>
                  ))}
                </select>
                {transferErrors.sourceAccountId && (
                  <p className="mt-1 text-xs text-red-600">{transferErrors.sourceAccountId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">To Account (Destination)</label>
                <select
                  {...registerTransfer('destinationAccountId')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select destination account</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                    </option>
                  ))}
                </select>
                {transferErrors.destinationAccountId && (
                  <p className="mt-1 text-xs text-red-600">{transferErrors.destinationAccountId.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...registerTransfer('amount')}
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {transferErrors.amount && (
                    <p className="mt-1 text-xs text-red-600">{transferErrors.amount.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Date</label>
                  <input
                    type="date"
                    {...registerTransfer('transactionDate')}
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {transferErrors.transactionDate && (
                    <p className="mt-1 text-xs text-red-600">{transferErrors.transactionDate.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Transfer Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Savings, Credit Card Bill Payment"
                  {...registerTransfer('description')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransfer || transferMutation.isPending}
                  className="inline-flex items-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  {transferMutation.isPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
                  Save transfer record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Statement Import Modal */}
      <StatementImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
}

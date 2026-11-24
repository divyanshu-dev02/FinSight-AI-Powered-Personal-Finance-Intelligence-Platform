import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiResponse } from '@/lib/api';
import { Transaction, FinancialAccount, Category } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatementImportModal } from './StatementImportModal';

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
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const [includeArchived, setIncludeArchived] = useState(false);

  // 1. Fetch transactions (defaults to active accounts only)
  const { data: transactionsPage, isLoading } = useQuery({
    queryKey: ['transactions', page, includeArchived],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PaginatedData<Transaction>>>(
        `/transactions?page=${page}&size=15&includeArchived=${includeArchived}`
      );
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

  const handleExportJson = () => {
    if (!transactionsPage?.content) return;
    const jsonStr = JSON.stringify(transactionsPage.content, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `finsight-transactions-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const rawTransactions = transactionsPage?.content || [];
  const transactions = searchTerm
    ? rawTransactions.filter(
        (t) =>
          t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (t.merchant && t.merchant.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (t.categoryName && t.categoryName.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : rawTransactions;

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-gray-200 pb-5 gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">Transactions</h2>
          <p className="mt-1 text-sm text-gray-500">
            View, search, filter, and track all your financial inflows, outflows, transfers, and statement imports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Export Dropdown */}
          <div className="relative group inline-block">
            <button
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-all cursor-pointer"
            >
              <span>📤</span>
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
              <span className="text-[10px] text-gray-400">▼</span>
            </button>
            <div className="absolute right-0 mt-1 hidden w-44 rounded-xl bg-white p-1.5 shadow-xl border border-gray-100 group-hover:block z-20">
              <button
                onClick={handleExportCsv}
                className="w-full text-left rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 flex items-center gap-2"
              >
                <span>📊</span>
                <span>Download CSV</span>
              </button>
              <button
                onClick={handleExportJson}
                className="w-full text-left rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 flex items-center gap-2"
              >
                <span>📄</span>
                <span>Download JSON</span>
              </button>
            </div>
          </div>

          {/* Import Statement */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs font-semibold text-blue-700 shadow-xs hover:bg-blue-100 transition-all cursor-pointer"
          >
            <span>📥</span>
            <span>Import Statement</span>
          </button>

          {/* Transfer Funds */}
          <button
            onClick={() => {
              resetTransfer();
              setErrorMessage(null);
              setIsTransferModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs font-semibold text-indigo-700 shadow-xs hover:bg-indigo-100 transition-all cursor-pointer"
          >
            <span>⇄</span>
            <span>Transfer Funds</span>
          </button>

          {/* Add Transaction */}
          <button
            onClick={() => {
              reset();
              setErrorMessage(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-all cursor-pointer"
          >
            <span>+</span>
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Scope / Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white px-5 py-3.5 rounded-2xl border border-gray-200 gap-4 shadow-xs">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative w-full max-w-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by description, merchant, category..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:border-blue-500"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Clear
            </button>
          )}
        </div>

        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(0);
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-xs font-medium text-gray-600">
            Include archived accounts
          </span>
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : transactions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
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
                  <td
                    className={`whitespace-nowrap px-6 py-4 text-right font-bold ${
                      tx.isTransfer
                        ? 'text-indigo-600'
                        : tx.direction === 'CREDIT'
                        ? 'text-emerald-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {tx.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
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

      {/* First-Class Transfer Funds Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⇄</span>
                <h3 className="text-lg font-bold text-gray-900">Transfer Funds Between Accounts</h3>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Transfers move money between your accounts without affecting your monthly income or expense totals.
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
                  Complete Transfer
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

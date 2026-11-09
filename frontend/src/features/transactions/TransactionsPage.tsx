import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiResponse } from '@/lib/api';
import { Transaction, FinancialAccount, Category } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

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

interface PaginatedData<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // 1. Fetch transactions
  const { data: transactionsPage, isLoading } = useQuery({
    queryKey: ['transactions', page],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PaginatedData<Transaction>>>(`/transactions?page=${page}&size=15`);
      return res.data.data;
    },
  });

  // 2. Fetch accounts for the dropdown
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialAccount[]>>('/accounts');
      return res.data.data;
    },
  });

  // 3. Fetch categories for the dropdown
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

  const onSubmit = (data: TransactionFormData) => {
    setErrorMessage(null);
    createMutation.mutate(data);
  };

  const transactions = transactionsPage?.content || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">Transactions</h2>
          <p className="mt-1 text-sm text-gray-500">
            View, search, and track all your financial inflows and outflows.
          </p>
        </div>
        <button
          onClick={() => {
            reset();
            setErrorMessage(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          + Add Transaction
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : transactions.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Account</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/50">
                  <td className="whitespace-nowrap px-6 py-4 text-gray-600">
                    {formatDate(tx.transactionDate)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{tx.description}</div>
                    {tx.merchant && <div className="text-xs text-gray-400">{tx.merchant}</div>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                    {tx.categoryName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: tx.categoryColor || '#6B7280' }}
                        />
                        {tx.categoryName}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Uncategorized</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-500">{tx.accountName}</td>
                  <td
                    className={`whitespace-nowrap px-6 py-4 text-right font-semibold ${
                      tx.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'
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
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination controls */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
            <span className="text-xs text-gray-500">
              Page {(transactionsPage?.number || 0) + 1} of {transactionsPage?.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={!transactionsPage || page >= transactionsPage.totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-sm font-semibold text-gray-900">No transactions recorded</h3>
          <p className="mt-1 text-sm text-gray-500">Record your expenses or income to establish your cash flow.</p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Record Transaction
            </button>
          </div>
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200">
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
                  <label className="flex items-center justify-center rounded-lg border p-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="DEBIT"
                      {...register('direction')}
                      className="mr-2 text-red-600"
                    />
                    Expense (Debit)
                  </label>
                  <label className="flex items-center justify-center rounded-lg border p-2 text-sm cursor-pointer hover:bg-gray-50">
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending}
                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


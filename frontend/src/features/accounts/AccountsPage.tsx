import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiResponse } from '@/lib/api';
import { FinancialAccount, AccountType } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const accountSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  type: z.enum(['CASH', 'BANK_ACCOUNT', 'CREDIT_CARD', 'DIGITAL_WALLET', 'LOAN', 'OTHER']),
  currency: z.string().length(3, 'Must be 3-character ISO code').default('INR'),
  openingBalance: z.coerce.number().min(0, 'Balance must be non-negative'),
  institutionLabel: z.string().max(100).optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialAccount[]>>('/accounts');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      const res = await api.post<ApiResponse<FinancialAccount>>('/accounts', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setIsModalOpen(false);
      reset();
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(error.response?.data?.error?.message || 'Failed to create account');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      type: 'BANK_ACCOUNT',
      currency: 'INR',
      openingBalance: 0,
    },
  });

  const onSubmit = (data: AccountFormData) => {
    setErrorMessage(null);
    createMutation.mutate(data);
  };

  const getAccountTypeLabel = (type: AccountType) => {
    switch (type) {
      case 'BANK_ACCOUNT': return 'Bank Account';
      case 'CREDIT_CARD': return 'Credit Card';
      case 'DIGITAL_WALLET': return 'Digital Wallet';
      case 'CASH': return 'Cash';
      case 'LOAN': return 'Loan';
      default: return 'Other';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">Financial Accounts</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your bank accounts, credit cards, digital wallets, and cash reserves.
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
          + Add Account
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                    {getAccountTypeLabel(acc.type)}
                  </span>
                  {acc.institutionLabel && (
                    <span className="text-xs text-gray-400">{acc.institutionLabel}</span>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{acc.name}</h3>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatCurrency(acc.currentBalance, acc.currency)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Opening: {formatCurrency(acc.openingBalance, acc.currency)}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">Added {formatDate(acc.createdAt)}</span>
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${acc.name}?`)) {
                      deleteMutation.mutate(acc.id);
                    }
                  }}
                  className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-sm font-semibold text-gray-900">No accounts yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first financial account.</p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Create Account
            </button>
          </div>
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Add Financial Account</h3>
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
                <label className="block text-xs font-semibold text-gray-700">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Salary Account"
                  {...register('name')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Account Type</label>
                <select
                  {...register('type')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="BANK_ACCOUNT">Bank Account</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="DIGITAL_WALLET">Digital Wallet (UPI/Paytm)</option>
                  <option value="CASH">Cash in Hand</option>
                  <option value="LOAN">Loan / Liability</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Institution Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank, Chase, SBI"
                  {...register('institutionLabel')}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    {...register('currency')}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
                  />
                  {errors.currency && (
                    <p className="mt-1 text-xs text-red-600">{errors.currency.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Opening Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('openingBalance')}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {errors.openingBalance && (
                    <p className="mt-1 text-xs text-red-600">{errors.openingBalance.message}</p>
                  )}
                </div>
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
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


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
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch all accounts including archived ones
  const { data: allAccounts, isLoading } = useQuery({
    queryKey: ['accounts', true],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialAccount[]>>('/accounts?includeArchived=true');
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

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/accounts/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
      case 'BANK_ACCOUNT': return { label: 'Bank Account', icon: '🏛️' };
      case 'CREDIT_CARD': return { label: 'Credit Card', icon: '💳' };
      case 'DIGITAL_WALLET': return { label: 'Digital Wallet', icon: '📱' };
      case 'CASH': return { label: 'Cash', icon: '💵' };
      case 'LOAN': return { label: 'Loan', icon: '📝' };
      default: return { label: 'Other', icon: '📁' };
    }
  };

  const activeAccounts = allAccounts?.filter((a) => a.active) || [];
  const archivedAccounts = allAccounts?.filter((a) => !a.active) || [];
  const currentList = activeTab === 'ACTIVE' ? activeAccounts : archivedAccounts;

  const totalActiveBalance = activeAccounts.reduce((acc, curr) => acc + (curr.currentBalance || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">Financial Accounts</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your bank accounts, credit cards, and digital wallets with dynamic derived balance computation.
          </p>
        </div>
        <button
          onClick={() => {
            reset();
            setErrorMessage(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-all cursor-pointer"
        >
          <span>+</span>
          <span>Add Account</span>
        </button>
      </div>

      {/* Account Balance Summary Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Total Accounts Balance</p>
          <h3 className="text-3xl font-black tracking-tight mt-1">
            {formatCurrency(totalActiveBalance, 'INR')}
          </h3>
          <p className="text-xs text-blue-200 mt-1">
            Sum of {activeAccounts.length} active financial account(s)
          </p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-xl bg-white/20 backdrop-blur-xs px-3 py-1.5 text-xs font-medium text-white">
            Derived Balance Architecture
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'ACTIVE'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active Accounts
          <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-bold">
            {activeAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ARCHIVED')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'ARCHIVED'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Archived & History
          <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-bold">
            {archivedAccounts.length}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : currentList.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {currentList.map((acc) => {
            const typeInfo = getAccountTypeLabel(acc.type);
            return (
              <div
                key={acc.id}
                className={`relative overflow-hidden rounded-2xl bg-white p-5 shadow-xs border flex flex-col justify-between transition-all hover:shadow-md ${
                  acc.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50/70 opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        acc.active
                          ? 'bg-blue-50 text-blue-700 ring-blue-700/10'
                          : 'bg-gray-100 text-gray-600 ring-gray-600/10'
                      }`}
                    >
                      <span>{typeInfo.icon}</span>
                      <span>{typeInfo.label}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {!acc.active && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Archived
                        </span>
                      )}
                      {acc.institutionLabel && (
                        <span className="text-xs text-gray-400 font-medium">{acc.institutionLabel}</span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-gray-900">{acc.name}</h3>
                  <p className="mt-2 text-2xl font-black text-gray-900">
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Opening: {formatCurrency(acc.openingBalance, acc.currency)}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-400">
                    {acc.active ? `Added ${formatDate(acc.createdAt)}` : 'Historical Account'}
                  </span>

                  {acc.active ? (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Archive "${acc.name}"?\n\nThis will safely hide the account from active entries, while preserving all past transactions, income, and expense records in your financial history.`
                          )
                        ) {
                          archiveMutation.mutate(acc.id);
                        }
                      }}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors cursor-pointer"
                    >
                      Archive & Hide
                    </button>
                  ) : (
                    <button
                      onClick={() => restoreMutation.mutate(acc.id)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      Restore Account
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center bg-white">
          {activeTab === 'ACTIVE' ? (
            <>
              <div className="text-3xl mb-2">🏦</div>
              <h3 className="text-sm font-semibold text-gray-900">No active accounts</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your primary financial account.</p>
              <div className="mt-6">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  + Create Account
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-900">No archived accounts</h3>
              <p className="mt-1 text-sm text-gray-500">
                When you archive an account, it will appear here with its historical records preserved.
              </p>
            </>
          )}
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
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
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Account Type</label>
                <select
                  {...register('type')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="BANK_ACCOUNT">Bank Account</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="DIGITAL_WALLET">Digital Wallet (UPI / Paytm)</option>
                  <option value="CASH">Cash in Hand</option>
                  <option value="LOAN">Loan / Liability</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Institution Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank, SBI, ICICI"
                  {...register('institutionLabel')}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    {...register('currency')}
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
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
                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
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

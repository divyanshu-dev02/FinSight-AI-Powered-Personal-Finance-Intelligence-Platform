import { useQuery } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';

export type Budget = {
  id: string;
  categoryId: string;
  categoryName: string;
  currency: string;
  amount: number;
  spent: number;
};
export type Goal = {
  id: string;
  name: string;
  currency: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string;
};
export type Commitment = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  frequency: 'WEEKLY' | 'MONTHLY';
  firstDate: string;
  active: boolean;
  accountActive: boolean;
};
export type Occurrence = {
  commitmentId: string;
  name: string;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  dueDate: string;
  transactionId?: string;
};
export type Candidate = { id: string; description: string; date: string; amount: number };
export type PlanningOverview = {
  month: string;
  today: string;
  through: string;
  budgets: Budget[];
  goals: Goal[];
  commitments: Commitment[];
  occurrences: Occurrence[];
};

export function usePlanning(userId: string, month?: string) {
  return useQuery({
    queryKey: ['dashboard-summary', 'planning', userId, month],
    queryFn: async ({ signal }) => (await api.get<ApiResponse<PlanningOverview>>('/planning', {
      params: { month }, signal,
    })).data.data,
  });
}

export function planningError(error: unknown) {
  return (error as { response?: { data?: ApiResponse<unknown> } }).response?.data?.error?.message
    ?? 'Could not save your change. Try again.';
}

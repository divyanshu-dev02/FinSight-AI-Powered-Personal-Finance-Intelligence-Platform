import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { PlanningPage } from './PlanningPage';
import { PlanningSnapshot } from './PlanningSnapshot';
import type { PlanningOverview } from './planning';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', baseCurrency: 'USD' } }),
}));

const overview: PlanningOverview = {
  month: '2025-05',
  today: '2025-05-05',
  through: '2025-06-03',
  budgets: [{ id: 'budget-1', categoryId: 'food', categoryName: 'Groceries', currency: 'USD', amount: 200, spent: 90 }],
  goals: [],
  commitments: [],
  occurrences: [
    {
      commitmentId: 'posted', name: 'Already posted', direction: 'DEBIT',
      amount: 100, currency: 'USD', dueDate: '2025-05-05', transactionId: 'txn-1',
    },
    {
      commitmentId: 'expected', name: 'Upcoming internet', direction: 'DEBIT',
      amount: 100, currency: 'USD', dueDate: '2025-05-06',
    },
  ],
};

it('edits a monthly budget and creates a confirmed recurring bill', async () => {
  const read = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { data: url === '/planning' ? overview : url === '/categories'
      ? [{ id: 'food', name: 'Groceries', type: 'EXPENSE', active: true }]
      : [{ id: 'account-1', name: 'Checking', currency: 'USD', active: true }] },
  }));
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { data: 'budget-1' } });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: 'commitment-1' } });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><PlanningPage /></MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Groceries budget' }));
    fireEvent.change(screen.getByLabelText('Budget limit'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/planning/budgets/budget-1', {
      categoryId: 'food', month: '2025-05', currency: 'USD', amount: '250',
    }));

    const recurring = screen.getByRole('region', { name: 'Recurring bills and income' });
    fireEvent.click(within(recurring).getByRole('button', { name: 'Add schedule' }));
    fireEvent.change(within(recurring).getByLabelText('Schedule name'), { target: { value: 'Internet' } });
    fireEvent.change(within(recurring).getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(within(recurring).getByLabelText('Expected amount in account currency'), { target: { value: '55' } });
    fireEvent.click(within(recurring).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/planning/commitments', {
      name: 'Internet', accountId: 'account-1', direction: 'DEBIT', amount: '55',
      frequency: 'MONTHLY', firstDate: '2025-05-05', active: true,
    }));
  } finally {
    read.mockRestore();
    put.mockRestore();
    post.mockRestore();
  }
});

it('shows only outstanding occurrences in the dashboard preview', async () => {
  const read = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: overview } });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><PlanningSnapshot month="2025-05" userId="user-1" /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/Upcoming internet/)).toBeInTheDocument();
    expect(screen.queryByText(/Already posted/)).not.toBeInTheDocument();
  } finally {
    read.mockRestore();
  }
});

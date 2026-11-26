import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { SpendingBrief } from './SpendingBrief';

it('shows linked evidence and removes a finding after dismissal succeeds', async () => {
  let dismissed = false;
  const get = vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      data: {
        periods: {
          currentStart: '2025-05-01', currentEnd: '2025-05-31',
          previousStart: '2025-04-01', previousEnd: '2025-04-30',
        },
        findings: dismissed ? [] : [{
          id: 'finding-id',
          kind: 'SPENDING_CHANGE',
          currency: 'INR',
          previousAmount: 100,
          currentAmount: 150,
          evidence: [{ id: 'transaction-id', date: '2025-05-05', amount: 150 }],
        }],
      },
    },
  }));
  const put = vi.spyOn(api, 'put').mockImplementation(async () => {
    dismissed = true;
    return { data: null };
  });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SpendingBrief month="2025-05" userId="owner" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByRole('link', { name: 'Ask Copilot' })).toHaveAttribute(
      'href', '/copilot?month=2025-05&comparison=brief'
    );
    expect(await screen.findByRole('heading', { name: /Spending rose/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('View supporting transactions'));
    expect(screen.getByText(/5 May 2025 ·/)).toHaveAttribute('href', '/transactions?evidence=transaction-id');
    fireEvent.click(screen.getByRole('button', { name: /Dismiss: Spending rose/ }));
    expect(await screen.findByText('No new findings for this month.')).toBeInTheDocument();
    expect(put).toHaveBeenCalledWith('/dashboard/brief/dismissals/finding-id');
  } finally {
    get.mockRestore();
    put.mockRestore();
  }
});

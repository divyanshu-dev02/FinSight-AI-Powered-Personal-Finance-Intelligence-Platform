import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { CopilotPage } from './CopilotPage';

it('uses the selected month and links recent expenses to their transaction details', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data: {
      data: path === '/copilot/availability' ? false : {
        month: '2026-11',
        previousMonth: '2026-10',
        current: [{ currency: 'INR', amount: 500 }],
        previous: [{ currency: 'INR', amount: 400 }],
        evidence: [{ id: 'expense-id', date: '2026-11-06', currency: 'INR', amount: 500 }],
        calculatedAt: '2026-11-26T17:30:00Z',
      },
    },
  }));
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/copilot?month=2026-11']}>
          <CopilotPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('INR')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/copilot/spending', expect.objectContaining({
      params: { month: '2026-11' },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Which recent expenses can I review?' }));
    expect(screen.getByRole('link', { name: /2026-11-06/ })).toHaveAttribute(
      'href', '/transactions?evidence=expense-id'
    );
  } finally {
    get.mockRestore();
  }
});

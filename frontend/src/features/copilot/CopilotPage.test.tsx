import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { CopilotPage } from './CopilotPage';

it('uses the selected month and links recent expenses to their transaction details', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data: {
      data: path === '/copilot/status' ? { available: false, provider: 'OpenAI' } : {
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

it('requires consent and passes the conversation into a follow-up', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async path => ({
    data: { data: path === '/copilot/status' ? { available: true, provider: 'Groq' } : { current: [], previous: [], evidence: [] } },
  }));
  const post = vi.spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { data: {
      answer: 'You spent INR 500.', sources: [{ id: 'S1', label: 'Grocery transaction', path: '/transactions?evidence=test-id' }],
    } } })
    .mockResolvedValueOnce({ data: { data: { answer: 'That was the only grocery transaction.', sources: [] } } });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/copilot?month=2026-11']}>
          <CopilotPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.change(await screen.findByLabelText('Ask a question'), { target: { value: 'What did I spend?' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow Copilot to send/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('link', { name: 'Grocery transaction' }))
      .toHaveAttribute('href', '/transactions?evidence=test-id');

    fireEvent.change(screen.getByLabelText('Ask a follow-up'), { target: { value: 'Was that all?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/That was the only grocery transaction/)).toBeInTheDocument();
    expect(post).toHaveBeenLastCalledWith('/copilot/chat', expect.objectContaining({
      question: 'Was that all?', month: '2026-11', provider: 'Groq',
      history: [
        { role: 'user', content: 'What did I spend?' },
        { role: 'assistant', content: 'You spent INR 500.' },
      ],
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText(/That was the only grocery transaction/)).not.toBeInTheDocument();
  } finally {
    get.mockRestore();
    post.mockRestore();
  }
});

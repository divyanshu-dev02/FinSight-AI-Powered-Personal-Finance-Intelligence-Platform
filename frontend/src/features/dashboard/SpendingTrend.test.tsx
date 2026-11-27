import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { SpendingTrend } from './SpendingTrend';

it('shows six months across a year boundary and links to matching expenses', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { buckets: [
    { bucket: '2026-11', currency: 'INR', amount: 250.25 },
    { bucket: '2027-01', currency: 'USD', amount: 12 },
  ], totals: { INR: 250.25, USD: 12 }, categories: [{ categoryId: 'food', name: 'Groceries', currency: 'INR', amount: 250.25 }],
    merchants: [{ name: 'Local Grocery', currency: 'INR', amount: 250.25 }] } } });
  try {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <SpendingTrend month="2027-01" currency="INR" userId="test" />
    </MemoryRouter></QueryClientProvider>);
    const emptyMonth = await screen.findByRole('button', { name: /August 2026, .*0.00 INR/ });
    expect(emptyMonth.querySelector('[data-spending-bar]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Groceries' })).toHaveAttribute(
      'href', '/transactions?currency=INR&spendingStart=2026-08-01&spendingEnd=2027-01-31&categoryId=food',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merchants' }));
    expect(screen.getByRole('link', { name: 'Local Grocery' })).toHaveAttribute(
      'href', '/transactions?currency=INR&spendingStart=2026-08-01&spendingEnd=2027-01-31&merchant=Local+Grocery',
    );
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }));
    expect(screen.queryByRole('button', { name: '2 months' })).not.toBeInTheDocument();
    const fundedMonth = screen.getByRole('button', { name: /November 2026, .*250.25 INR/ });
    expect(fundedMonth.querySelector('[data-spending-bar]')).toHaveTextContent('250.25');
    expect(screen.getByRole('group', { name: 'Monthly spending' }).querySelectorAll('button')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /November 2026, .*250.25 INR/ }));
    expect(screen.getByRole('link', { name: 'View selected bar transactions' })).toHaveAttribute('href', '/transactions?currency=INR&spendingMonth=2026-11');
    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: /January 2027, .*12.00 USD/ }));
    expect(screen.getByRole('link', { name: 'View selected bar transactions' })).toHaveAttribute('href', '/transactions?currency=USD&spendingMonth=2027-01');
    fireEvent.click(screen.getByRole('button', { name: '1 month' }));
    expect((await screen.findByRole('group', { name: 'Daily spending' })).querySelectorAll('button')).toHaveLength(31);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-12-29' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/dashboard/spending-trend', expect.objectContaining({
      params: { month: '2027-01', start: '2026-12-29', end: '2027-01-02' },
    })));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Daily spending' }).querySelectorAll('button')).toHaveLength(5));
    expect(screen.getByRole('link', { name: 'View range transactions' })).toHaveAttribute(
      'href', '/transactions?currency=USD&spendingStart=2026-12-29&spendingEnd=2027-01-02',
    );
    expect(screen.getByRole('link', { name: 'View selected bar transactions' })).toHaveAttribute(
      'href', '/transactions?currency=USD&spendingStart=2027-01-02&spendingEnd=2027-01-02',
    );
  } finally {
    get.mockRestore();
  }
});

it('keeps the previous chart and its transaction dates visible while loading a custom range', async () => {
  let complete = () => {};
  const response = { data: { data: { buckets: [], totals: {} } } };
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce(response).mockImplementationOnce(
    () => new Promise(resolve => { complete = () => resolve(response); }),
  );
  try {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <SpendingTrend month="2027-01" currency="INR" userId="test" />
    </MemoryRouter></QueryClientProvider>);
    const chart = await screen.findByRole('group', { name: 'Monthly spending' });
    const original = screen.getByRole('link', { name: 'View range transactions' }).getAttribute('href');
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-01-10' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
    expect(await screen.findByText(/Updating…/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Monthly spending' })).toBe(chart);
    expect(screen.getByRole('link', { name: 'View range transactions' })).toHaveAttribute('href', original);
    complete();
    await screen.findByRole('group', { name: 'Daily spending' });
    expect(screen.getByRole('link', { name: 'View range transactions' })).toHaveAttribute(
      'href', '/transactions?currency=INR&spendingStart=2027-01-10&spendingEnd=2027-01-15',
    );
  } finally {
    get.mockRestore();
  }
});

it('reuses the same data when switching views and keeps transaction links scoped to the selected period', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: {
    buckets: [{ bucket: '2026-11', currency: 'INR', amount: 120.25 }, { bucket: '2027-01', currency: 'INR', amount: 30 }],
    totals: { INR: 150.25 },
  } } });
  try {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <SpendingTrend month="2027-01" currency="INR" userId="test" />
    </MemoryRouter></QueryClientProvider>);
    await screen.findByRole('group', { name: 'Monthly spending' });
    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Monthly spending' }).querySelectorAll('button')).toHaveLength(3));
    const requests = get.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Running total' }));
    expect(screen.getByRole('group', { name: 'Cumulative spending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /January 2027.*150\.25 running total/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /December 2026.*0\.00 INR spent.*120\.25 running total/ }));
    expect(screen.getByRole('link', { name: 'View period transactions' })).toHaveAttribute(
      'href', '/transactions?currency=INR&spendingMonth=2026-12',
    );
    expect(get).toHaveBeenCalledTimes(requests);
  } finally {
    get.mockRestore();
  }
});

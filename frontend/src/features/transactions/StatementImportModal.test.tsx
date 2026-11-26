import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { StatementImportModal } from './StatementImportModal';

it('submits a reviewed suggestion as a merchant rule and displays the confirmed counts', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { data: url === '/accounts'
      ? [{ id: 'account-1', name: 'Checking', currency: 'USD', currentBalance: 500 }]
      : [{ id: 'groceries', name: 'Groceries', type: 'EXPENSE' }] },
  }));
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => ({
    data: { data: url === '/transactions/import/preview' ? {
      fileToken: 'test-preview', suggestedMapping: {}, totalRows: 2, validRows: 1, duplicateRows: 1, errorRows: 0,
      previewRows: [
        {
          rowNumber: 1, date: '2025-06-02', description: 'Market transaction',
          normalizedMerchant: 'Local Market', amount: 75, direction: 'DEBIT', duplicate: false,
          suggestedCategoryId: 'groceries', suggestedCategoryName: 'Groceries', savedRule: false,
        },
        { rowNumber: 2, duplicate: true, duplicateReason: 'IN_FILE' },
      ],
    } : { id: 'batch-1', successfulRows: 1, duplicateRows: 1, failedRows: 0 } },
  }));
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <StatementImportModal isOpen onClose={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByRole('option', { name: /Checking/ });
    fireEvent.change(screen.getByLabelText('Target Financial Account'), { target: { value: 'account-1' } });
    fireEvent.change(screen.getByLabelText('Click to select file'), {
      target: { files: [new File(['test'], 'statement.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse & Preview Statement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use suggestion for row 1' }));
    expect(screen.getByText('Repeated in file')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Use for future Local Market/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByText('1 imported · 1 skipped as duplicates · 0 rejected')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/transactions/import/confirm', expect.objectContaining({
      fileToken: 'test-preview',
      skipDuplicates: true,
      reviews: [{ rowNumber: 1, categoryId: 'groceries', saveRule: true }],
    }));
  } finally {
    get.mockRestore();
    post.mockRestore();
  }
});

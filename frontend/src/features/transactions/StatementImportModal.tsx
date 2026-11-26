import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';
import { Link } from 'react-router-dom';
import { Category, FinancialAccount } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface CsvPreviewRow {
  rowNumber: number;
  date?: string;
  description?: string;
  merchant?: string;
  amount?: number;
  direction?: 'DEBIT' | 'CREDIT';
  categoryName?: string;
  duplicate: boolean;
  validationError?: string;
  normalizedMerchant?: string;
  duplicateReason?: 'IN_FILE' | 'EXISTING';
  matchingTransactionId?: string;
  suggestedCategoryId?: string;
  suggestedCategoryName?: string;
  savedRule: boolean;
}

interface CsvColumnMapping {
  dateColumn?: string;
  descriptionColumn?: string;
  merchantColumn?: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  categoryColumn?: string;
  dateFormat?: string;
}

interface CsvPreviewResponse {
  fileToken: string;
  fileName: string;
  fileHash: string;
  detectedHeaders: string[];
  suggestedMapping: CsvColumnMapping;
  previewRows: CsvPreviewRow[];
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
}

interface ImportBatch {
  id: string;
  fileName: string;
  status: string;
  successfulRows: number;
  duplicateRows: number;
  failedRows: number;
  startedAt: string;
  rejectionDetails?: { rowNumber: number; message: string }[];
}

interface RowReview {
  rowNumber: number;
  categoryId?: string;
  saveRule: boolean;
}

interface StatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StatementImportModal({ isOpen, onClose }: StatementImportModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'SUCCESS' | 'HISTORY'>('UPLOAD');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [previewData, setPreviewData] = useState<CsvPreviewResponse | null>(null);
  const [reviews, setReviews] = useState<Record<number, RowReview>>({});
  const [page, setPage] = useState(0);
  const [batch, setBatch] = useState<ImportBatch>();
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'DUPLICATES' | 'UNCATEGORIZED' | 'ERRORS'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch accounts for account selector
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FinancialAccount[]>>('/accounts');
      return res.data.data;
    },
    enabled: isOpen,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<ApiResponse<Category[]>>('/categories')).data.data,
    enabled: isOpen && step === 'PREVIEW',
  });
  const history = useQuery({
    queryKey: ['statement-import-history'],
    queryFn: async () => (await api.get<ApiResponse<ImportBatch[]>>('/transactions/imports')).data.data,
    enabled: isOpen && step === 'HISTORY',
  });
  const additionalRows = useQuery({
    queryKey: ['statement-preview', previewData?.fileToken, page],
    queryFn: async ({ signal }) => (await api.get<ApiResponse<CsvPreviewRow[]>>(
      `/transactions/import/previews/${previewData?.fileToken}/rows`, { params: { page }, signal }
    )).data.data,
    enabled: isOpen && step === 'PREVIEW' && !!previewData && page > 0,
    retry: false,
  });
  const pageRows = page === 0 ? previewData?.previewRows ?? [] : additionalRows.data ?? [];
  const currency = accounts?.find(account => account.id === selectedAccountId)?.currency;

  const getFileFormat = (file: File | null) => {
    if (!file) return null;
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'PDF';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'EXCEL';
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return 'CSV';
    return 'UNKNOWN';
  };

  const fileFormat = getFileFormat(selectedFile);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedAccountId) {
        throw new Error('Please select a target account and a statement file');
      }
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('accountId', selectedAccountId);
      if (pdfPassword.trim()) {
        formData.append('password', pdfPassword.trim());
      }

      const res = await api.post<ApiResponse<CsvPreviewResponse>>(
        '/transactions/import/preview',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setPage(0);
      setReviews({});
      setPreviewFilter('ALL');
      setPdfPassword('');
      setStep('PREVIEW');
      setErrorMessage(null);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setErrorMessage(error.response?.data?.error?.message || error.message || 'Failed to process statement file');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) return;
      const payload = {
        fileToken: previewData.fileToken,
        accountId: selectedAccountId,
        mapping: previewData.suggestedMapping,
        skipDuplicates,
        reviews: Object.values(reviews),
      };
      const res = await api.post<ApiResponse<ImportBatch>>('/transactions/import/confirm', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      setBatch(data);
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['statement-import-history'] });
      void queryClient.invalidateQueries({ queryKey: ['copilot-spending'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      setStep('SUCCESS');
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setErrorMessage(error.response?.data?.error?.message || error.message || 'Failed to confirm import');
    },
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMessage(null);
    }
  };

  const handleReset = () => {
    setStep('UPLOAD');
    setSelectedFile(null);
    setPdfPassword('');
    setPreviewData(null);
    setReviews({});
    setPage(0);
    setBatch(undefined);
    setSkipDuplicates(true);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div role="dialog" aria-modal="true" aria-labelledby="statement-import-title" className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-gray-100 transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">
              ⚡
            </div>
            <div>
              <h3 id="statement-import-title" className="text-lg font-bold text-gray-900">Import statement</h3>
              <p className="text-xs text-gray-500">
                Upload bank statements in any format: PDF (including password-protected), Excel (.xlsx/.xls), or CSV.
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            aria-label="Close statement import"
            disabled={confirmMutation.isPending || previewMutation.isPending}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {(step === 'UPLOAD' || step === 'SUCCESS') && (
          <button type="button" onClick={() => { setStep('HISTORY'); setErrorMessage(null); }}
            className="mt-4 text-sm font-semibold text-blue-700 underline">
            View import history
          </button>
        )}
        {step === 'HISTORY' && (
          <section className="mt-4 space-y-3" aria-label="Import history">
            <button type="button" onClick={() => setStep('UPLOAD')} className="text-sm text-blue-700 underline">
              Back to upload
            </button>
            {history.isPending && <p role="status">Loading history…</p>}
            {history.isError && <p role="alert">Could not load import history. <button type="button" onClick={() => void history.refetch()} className="underline">Retry</button></p>}
            {history.data?.length === 0 && <p>No statements imported yet.</p>}
            <ul className="divide-y divide-gray-200">
              {history.data?.map(item => (
                <li key={item.id} className="space-y-1 py-3 text-sm">
                  <p className="break-words font-semibold">{item.fileName}</p>
                  <p className="text-gray-600">{formatDate(item.startedAt)} · {item.status.toLowerCase()}</p>
                  <p>{item.successfulRows} imported · {item.duplicateRows} duplicate rows · {item.failedRows} rejected</p>
                  {!!item.rejectionDetails?.length && (
                    <details>
                      <summary className="cursor-pointer text-blue-700">View rejected rows</summary>
                      <ul className="space-y-1 py-1">
                        {item.rejectionDetails.map(issue => <li key={issue.rowNumber}>Row {issue.rowNumber} · {issue.message}</li>)}
                      </ul>
                      {item.failedRows > item.rejectionDetails.length && <p>Showing the first {item.rejectionDetails.length} rejections.</p>}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div className="mt-5 space-y-4">
            {/* Target Account Picker */}
            <div>
              <label htmlFor="statement-target-account" className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
                Target Financial Account
              </label>
              <select
                id="statement-target-account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm font-medium text-gray-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">Select destination account for imported transactions</option>
                {accounts?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                  </option>
                ))}
              </select>
            </div>

            {/* Drag & Drop File Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
                Bank Statement Document
              </label>
              <div className="mt-1.5 flex justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-6 pt-6 pb-6 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer">
                <div className="space-y-2 text-center">
                  <div className="text-4xl">
                    {fileFormat === 'PDF' ? '📑' : fileFormat === 'EXCEL' ? '📊' : fileFormat === 'CSV' ? '📋' : '📂'}
                  </div>
                  <div className="flex flex-col items-center text-sm text-gray-600">
                    <label className="relative cursor-pointer rounded-lg font-semibold text-blue-600 hover:text-blue-700 focus-within:outline-none">
                      <span>Click to select file</span>
                      <input
                        type="file"
                        accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="text-xs text-gray-400 mt-1">Supports PDF, Excel (.xlsx, .xls), CSV, TSV up to 10MB</p>
                  </div>
                  {selectedFile && (
                    <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                      <span>✓ {selectedFile.name}</span>
                      <span className="text-[10px] bg-blue-200 px-1.5 py-0.5 rounded uppercase">
                        {fileFormat}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conditional Password Input for Protected PDFs */}
            {fileFormat === 'PDF' && (
              <div className="rounded-xl bg-amber-50/70 p-4 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                    <span>🔒</span>
                    <span>Statement Password (Optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-xs font-medium text-amber-700 hover:text-amber-900"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  placeholder="Enter password if your PDF is password-protected"
                  className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-[11px] text-amber-800">
                  Tip: Indian banks often password-protect statements with your PAN (uppercase) + Date of Birth (DDMMYYYY) or account number.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFile || !selectedAccountId || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {previewMutation.isPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
                Parse & Preview Statement
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & CONFIRM */}
        {step === 'PREVIEW' && previewData && (() => {
          const isUncategorized = (row: CsvPreviewRow) => {
            const review = reviews[row.rowNumber];
            return review
              ? !review.categoryId
              : !row.savedRule && (!row.categoryName || row.categoryName.trim().toLowerCase() === 'uncategorized');
          };
          const uncategorizedCount = pageRows.filter(row => !row.validationError && isUncategorized(row)).length;

          const filteredRows = pageRows.filter((row) => {
            if (previewFilter === 'DUPLICATES') return row.duplicate;
            if (previewFilter === 'UNCATEGORIZED') return !row.validationError && isUncategorized(row);
            if (previewFilter === 'ERRORS') return !!row.validationError;
            return true;
          });

          return (
            <div className="mt-5 space-y-4">
              {/* Metric badges / Filter tabs */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-center">
                <button
                  type="button"
                  onClick={() => setPreviewFilter('ALL')}
                  className={`rounded-xl p-3 border text-center transition-all cursor-pointer ${
                    previewFilter === 'ALL'
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <p className="text-xs text-gray-500 font-medium">All Rows</p>
                  <p className="text-xl font-extrabold text-gray-900 mt-0.5">{previewData.totalRows}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('DUPLICATES')}
                  className={`rounded-xl p-3 border text-center transition-all cursor-pointer ${
                    previewFilter === 'DUPLICATES'
                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                      : previewData.duplicateRows > 0
                      ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/60'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <p className="text-xs text-amber-700 font-medium">Duplicates</p>
                  <p className="text-xl font-extrabold text-amber-800 mt-0.5">{previewData.duplicateRows}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('UNCATEGORIZED')}
                  className={`rounded-xl p-3 border text-center transition-all cursor-pointer ${
                    previewFilter === 'UNCATEGORIZED'
                      ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-300'
                      : uncategorizedCount > 0
                      ? 'bg-purple-50 border-purple-200 hover:bg-purple-100/60'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <p className="text-xs text-purple-700 font-medium">Uncategorized</p>
                  <p className="text-xl font-extrabold text-purple-800 mt-0.5">{uncategorizedCount}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('ERRORS')}
                  className={`rounded-xl p-3 border text-center transition-all cursor-pointer ${
                    previewFilter === 'ERRORS'
                      ? 'bg-red-100 border-red-400 ring-2 ring-red-300'
                      : previewData.errorRows > 0
                      ? 'bg-red-50 border-red-200 hover:bg-red-100/60'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <p className="text-xs text-red-700 font-medium">Errors</p>
                  <p className="text-xl font-extrabold text-red-800 mt-0.5">{previewData.errorRows}</p>
                </button>
              </div>

              {/* Duplicate Warning Review Banner */}
              {previewData.duplicateRows > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-3">
                  <span className="text-lg leading-none">⚠️</span>
                  <div className="text-xs text-amber-900 space-y-1">
                    <p className="font-bold">
                      {previewData.duplicateRows} Potential Duplicate{previewData.duplicateRows > 1 ? 's' : ''} Detected
                    </p>
                    <p className="text-amber-800">
                      These rows share a date, amount, direction, and description with an existing transaction or another row in this file.
                      {skipDuplicates ? ' They will be safely skipped during import.' : '  Matching rows will be kept.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Uncategorized Informational Banner */}
              {uncategorizedCount > 0 && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-3.5 flex items-start gap-3">
                  <span className="text-lg leading-none">🏷️</span>
                  <div className="text-xs text-purple-900 space-y-1">
                    <p className="font-bold">
                      {uncategorizedCount} Uncategorized Transaction{uncategorizedCount > 1 ? 's' : ''}
                    </p>
                    <p className="text-purple-800">
                      Choose a category or leave them uncategorized. Saved merchant rules apply automatically unless you override them.
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicate policy checkbox */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  Skip rows with matching transactions
                </label>
                {previewFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('ALL')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Reset page filter
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Page {page + 1} of {Math.max(1, Math.ceil(previewData.totalRows / 25))}</span>
                <div className="flex gap-3">
                  <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="text-blue-700 underline disabled:text-slate-400">Previous</button>
                  <button type="button" disabled={(page + 1) * 25 >= previewData.totalRows} onClick={() => setPage(page + 1)} className="text-blue-700 underline disabled:text-slate-400">Next</button>
                </div>
              </div>
              {page > 0 && additionalRows.isPending && <p role="status">Loading statement rows…</p>}
              {page > 0 && additionalRows.isError && <p role="alert">Could not load this page. <button type="button" className="underline" onClick={() => void additionalRows.refetch()}>Retry</button></p>}

              {/* Statement rows */}
              <div className="max-h-96 overflow-auto rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider text-left font-semibold sticky top-0">
                    <tr>
                      <th className="px-3.5 py-2.5">#</th>
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3.5 py-2.5">Description</th>
                      <th className="px-3.5 py-2.5">Category</th>
                      <th className="px-3.5 py-2.5 text-right">Amount</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-400">
                          No transactions found matching this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const uncategorized = isUncategorized(row);
                        const review = reviews[row.rowNumber];
                        return (
                          <tr
                            key={row.rowNumber}
                            className={`hover:bg-gray-50/70 transition-colors ${
                              row.duplicate ? 'bg-amber-50/30' : row.validationError ? 'bg-red-50/30' : ''
                            }`}
                          >
                            <td className="px-3.5 py-2.5 text-gray-400 font-mono">{row.rowNumber}</td>
                            <td className="px-3.5 py-2.5 text-gray-700 whitespace-nowrap">
                              {row.date ? formatDate(row.date) : '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-900 font-medium truncate max-w-xs">
                              {row.description}
                              {row.normalizedMerchant && <span className="block text-slate-500">{row.normalizedMerchant}</span>}
                              {row.validationError && <span className="block whitespace-normal text-red-700">{row.validationError}</span>}
                            </td>
                            <td className="px-3.5 py-2.5">
                              {!row.validationError && (
                                <div className="min-w-44 space-y-1">
                                  <select
                                    aria-label={`Category for row ${row.rowNumber}`}
                                    disabled={(skipDuplicates && row.duplicate) || confirmMutation.isPending}
                                    className="w-full rounded border border-slate-300 px-2 py-1"
                                    value={review
                                      ? review.categoryId ?? ''
                                      : row.savedRule || row.categoryName ? row.suggestedCategoryId ?? 'original' : 'original'}
                                    onChange={event => {
                                      const categoryId = event.target.value;
                                      setReviews(current => {
                                        const next = { ...current };
                                        if (categoryId === 'original') delete next[row.rowNumber];
                                        else next[row.rowNumber] = { rowNumber: row.rowNumber, categoryId: categoryId || undefined, saveRule: false };
                                        return next;
                                      });
                                    }}
                                  >
                                    <option value="original">{row.categoryName || 'Default category'}</option>
                                    <option value="">Uncategorized</option>
                                    {categories?.filter(category => category.type === (row.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE'))
                                      .map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                                  </select>
                                  {row.suggestedCategoryName && (
                                    <p className="text-slate-600">{row.savedRule ? 'Saved rule' : 'Suggested'} · {row.suggestedCategoryName}</p>
                                  )}
                                  {row.suggestedCategoryId && !row.savedRule && !row.categoryName && !review && (
                                    <button type="button" disabled={confirmMutation.isPending || (skipDuplicates && row.duplicate)}
                                      className="text-blue-700 underline disabled:text-slate-400"
                                      onClick={() => setReviews(current => ({
                                        ...current, [row.rowNumber]: { rowNumber: row.rowNumber, categoryId: row.suggestedCategoryId, saveRule: false },
                                      }))}>
                                      Use suggestion for row {row.rowNumber}
                                    </button>
                                  )}
                                  {row.normalizedMerchant && review?.categoryId && (
                                    <label className="flex items-start gap-1">
                                      <input type="checkbox" checked={review.saveRule}
                                        disabled={confirmMutation.isPending || (skipDuplicates && row.duplicate)}
                                        onChange={event => setReviews(current => ({
                                          ...current, [row.rowNumber]: { ...review, saveRule: event.target.checked },
                                        }))} />
                                      Use for future {row.normalizedMerchant} charges of this type
                                    </label>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 font-bold text-right whitespace-nowrap">
                              {row.amount ? (
                                <span className={row.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'}>
                                  {row.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(row.amount, currency)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="space-y-2 px-3.5 py-2.5 text-center whitespace-nowrap">
                              {row.validationError ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  Error
                                </span>
                              ) : row.duplicate ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  {row.duplicateReason === 'IN_FILE' ? 'Repeated in file' : 'Existing match'}
                                </span>
                              ) : uncategorized ? (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                                  Uncategorized
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  Valid
                                </span>
                              )}
                              {row.matchingTransactionId && (
                                <Link to={`/transactions?evidence=${row.matchingTransactionId}`}
                                  target="_blank" rel="noopener" className="block text-blue-700 underline">View match</Link>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setStep('UPLOAD')}
                  disabled={confirmMutation.isPending}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={confirmMutation.isPending || previewData.totalRows === previewData.errorRows}
                  onClick={() => confirmMutation.mutate()}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {confirmMutation.isPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
                  Confirm import
                </button>
              </div>
            </div>
          );
        })()}

        {/* STEP 3: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="py-10 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-3xl shadow-xs">
              ✓
            </div>
            <h4 className="text-xl font-extrabold text-gray-900">Statement import complete</h4>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              {batch && `${batch.successfulRows} imported · ${batch.duplicateRows} skipped as duplicates · ${batch.failedRows} rejected`}
            </p>
            <div className="pt-4">
              <button
                onClick={handleReset}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Return to Transactions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

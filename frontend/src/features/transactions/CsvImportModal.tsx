import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiResponse } from '@/lib/api';
import { FinancialAccount } from '@/types/finance';
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

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'SUCCESS'>('UPLOAD');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<CsvPreviewResponse | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
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

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedAccountId) {
        throw new Error('Please select an account and a CSV file');
      }
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('accountId', selectedAccountId);

      const res = await api.post<ApiResponse<CsvPreviewResponse>>(
        '/transactions/import/preview',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setStep('PREVIEW');
      setErrorMessage(null);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setErrorMessage(error.response?.data?.error?.message || error.message || 'Failed to process CSV file');
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
      };
      const res = await api.post('/transactions/import/confirm', payload);
      return res.data;
    },
    onSuccess: () => {
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
    setPreviewData(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Import Statement CSV</h3>
            <p className="text-xs text-gray-500">
              Bulk import banking, credit card, or UPI transactions with formula injection defense.
            </p>
          </div>
          <button onClick={handleReset} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 border border-red-200 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Target Account</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select destination account</option>
                {accounts?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2">
              <label className="block text-xs font-semibold text-gray-700">Select CSV File</label>
              <div className="mt-1 flex justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 pt-5 pb-6 hover:border-blue-400 transition-colors">
                <div className="space-y-1 text-center">
                  <div className="text-gray-400 text-3xl">📄</div>
                  <div className="flex text-sm text-gray-600">
                    <label className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                      <span>Upload statement file</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    {selectedFile ? selectedFile.name : 'CSV up to 5MB (Date, Narration, Debit/Credit)'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFile || !selectedAccountId || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {previewMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                Parse & Preview
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & CONFIRM */}
        {step === 'PREVIEW' && previewData && (
          <div className="mt-5 space-y-4">
            {/* Metric badges */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-2.5 border border-gray-200">
                <p className="text-xs text-gray-500">Total Rows</p>
                <p className="text-lg font-bold text-gray-900">{previewData.totalRows}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium">Valid</p>
                <p className="text-lg font-bold text-emerald-700">{previewData.validRows}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200">
                <p className="text-xs text-amber-700 font-medium">Duplicates</p>
                <p className="text-lg font-bold text-amber-700">{previewData.duplicateRows}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-2.5 border border-red-200">
                <p className="text-xs text-red-700 font-medium">Errors</p>
                <p className="text-lg font-bold text-red-700">{previewData.errorRows}</p>
              </div>
            </div>

            {/* Duplicate policy checkbox */}
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Skip {previewData.duplicateRows} duplicate transaction(s) automatically
            </label>

            {/* Sample Table */}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-left">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {previewData.previewRows.map((row) => (
                    <tr key={row.rowNumber} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-400">{row.rowNumber}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.date ? formatDate(row.date) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-xs">
                        {row.description || (row.validationError ? (
                          <span className="text-red-600">{row.validationError}</span>
                        ) : '—')}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {row.amount ? (
                          <span className={row.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'}>
                            {row.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(row.amount)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.validationError ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            Error
                          </span>
                        ) : row.duplicate ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Duplicate
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep('UPLOAD')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={confirmMutation.isPending || previewData.validRows === 0}
                onClick={() => confirmMutation.mutate()}
                className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {confirmMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                Confirm & Import ({previewData.validRows} rows)
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              ✓
            </div>
            <h4 className="text-xl font-bold text-gray-900">Transactions Imported Successfully!</h4>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Your statement transactions have been securely processed, categorized, and added to your financial digital twin.
            </p>
            <div className="pt-4">
              <button
                onClick={handleReset}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

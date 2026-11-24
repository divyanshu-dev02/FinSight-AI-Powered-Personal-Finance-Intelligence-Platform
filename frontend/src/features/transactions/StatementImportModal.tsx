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

interface StatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StatementImportModal({ isOpen, onClose }: StatementImportModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'SUCCESS'>('UPLOAD');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    setPdfPassword('');
    setPreviewData(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">
              ⚡
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Universal Statement Parser</h3>
              <p className="text-xs text-gray-500">
                Upload bank statements in any format: PDF (including password-protected), Excel (.xlsx/.xls), or CSV.
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div className="mt-5 space-y-4">
            {/* Target Account Picker */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
                Target Financial Account
              </label>
              <select
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
        {step === 'PREVIEW' && previewData && (
          <div className="mt-5 space-y-4">
            {/* Metric badges */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Total Rows</p>
                <p className="text-xl font-extrabold text-gray-900 mt-0.5">{previewData.totalRows}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium">Valid</p>
                <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{previewData.validRows}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200">
                <p className="text-xs text-amber-700 font-medium">Duplicates</p>
                <p className="text-xl font-extrabold text-amber-700 mt-0.5">{previewData.duplicateRows}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3 border border-red-200">
                <p className="text-xs text-red-700 font-medium">Errors</p>
                <p className="text-xl font-extrabold text-red-700 mt-0.5">{previewData.errorRows}</p>
              </div>
            </div>

            {/* Duplicate policy checkbox */}
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Skip {previewData.duplicateRows} duplicate transaction(s) using cryptographic fingerprinting
            </label>

            {/* Sample Table */}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider text-left font-semibold sticky top-0">
                  <tr>
                    <th className="px-3.5 py-2.5">#</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Description</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {previewData.previewRows.map((row) => (
                    <tr key={row.rowNumber} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-3.5 py-2.5 text-gray-400 font-mono">{row.rowNumber}</td>
                      <td className="px-3.5 py-2.5 text-gray-700 whitespace-nowrap">
                        {row.date ? formatDate(row.date) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-900 font-medium truncate max-w-xs">
                        {row.description || (row.validationError ? (
                          <span className="text-red-600 font-normal">{row.validationError}</span>
                        ) : '—')}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-right whitespace-nowrap">
                        {row.amount ? (
                          <span className={row.direction === 'CREDIT' ? 'text-emerald-600' : 'text-gray-900'}>
                            {row.direction === 'CREDIT' ? '+' : '-'} {formatCurrency(row.amount)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        {row.validationError ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            Error
                          </span>
                        ) : row.duplicate ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Duplicate
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep('UPLOAD')}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={confirmMutation.isPending || previewData.validRows === 0}
                onClick={() => confirmMutation.mutate()}
                className="inline-flex items-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {confirmMutation.isPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
                Confirm & Import ({previewData.validRows} transactions)
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="py-10 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-3xl shadow-xs">
              ✓
            </div>
            <h4 className="text-xl font-extrabold text-gray-900">Statement Imported Successfully!</h4>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              Your statement transactions have been securely parsed, validated, and recorded in your Financial Digital Twin.
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

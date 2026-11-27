import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/types/finance';

export function TransactionAmount({ amount, currency, direction, isTransfer }: Pick<Transaction, 'amount' | 'currency' | 'direction' | 'isTransfer'>) {
  const incoming = direction === 'CREDIT';
  const tone = isTransfer ? 'amount-transfer' : incoming ? 'amount-positive' : 'amount-negative';

  return <span className={`transaction-amount ${tone}`}>{incoming ? '+' : '−'}{formatCurrency(amount, currency)}</span>;
}

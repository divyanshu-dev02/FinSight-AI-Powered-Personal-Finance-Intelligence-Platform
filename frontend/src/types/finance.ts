export type AccountType =
  | 'CASH'
  | 'BANK_ACCOUNT'
  | 'CREDIT_CARD'
  | 'DIGITAL_WALLET'
  | 'LOAN'
  | 'OTHER';

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  institutionLabel?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CategoryType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon?: string;
  color?: string;
  parentId?: string;
  parentName?: string;
  isSystem: boolean;
  active: boolean;
  createdAt: string;
}

export type TransactionDirection = 'DEBIT' | 'CREDIT';
export type TransactionSource = 'MANUAL' | 'CSV' | 'SYSTEM';

export interface Transaction {
  id: string;
  accountId: string;
  accountName: string;
  categoryId?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  description: string;
  merchant?: string;
  transactionDate: string;
  postedDate?: string;
  source: TransactionSource;
  notes?: string;
  createdAt: string;
}

export interface CategorySpending {
  categoryId: string;
  categoryName: string;
  icon?: string;
  color?: string;
  totalSpent: number;
  percentageOfTotal: number;
}

export interface FinancialSummary {
  totalNetWorth: number;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingsRatePercentage: number;
  currency: string;
  categoryBreakdown: CategorySpending[];
}


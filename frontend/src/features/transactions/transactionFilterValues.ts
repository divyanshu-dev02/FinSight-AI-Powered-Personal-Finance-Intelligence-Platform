export const transactionFilterKeys = ['search', 'merchant', 'accountId', 'categoryId', 'type', 'from', 'to'] as const;
type TransactionFilterKey = typeof transactionFilterKeys[number];
export type TransactionFilterValues = Record<TransactionFilterKey, string>;

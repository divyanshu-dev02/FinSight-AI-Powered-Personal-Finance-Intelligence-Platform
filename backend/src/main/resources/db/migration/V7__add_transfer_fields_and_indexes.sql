-- V7: Add transfer support to transactions table

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS transfer_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS transfer_transaction_id UUID;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(user_id, is_transfer);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account ON transactions(user_id, transfer_account_id);

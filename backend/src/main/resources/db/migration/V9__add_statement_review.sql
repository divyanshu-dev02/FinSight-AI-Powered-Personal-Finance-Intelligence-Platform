ALTER TABLE import_batches ADD COLUMN account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL;

CREATE TABLE import_category_rules (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_key VARCHAR(255) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, merchant_key, direction)
);

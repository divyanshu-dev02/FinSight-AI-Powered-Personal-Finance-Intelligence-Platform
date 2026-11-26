CREATE TABLE monthly_budgets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
    currency VARCHAR(3) NOT NULL,
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    UNIQUE (user_id, month, category_id, currency)
);

CREATE TABLE savings_goals (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    target_amount NUMERIC(19, 4) NOT NULL CHECK (target_amount > 0),
    saved_amount NUMERIC(19, 4) NOT NULL CHECK (saved_amount >= 0),
    target_date DATE
);

CREATE INDEX idx_savings_goals_user ON savings_goals(user_id);

CREATE TABLE recurring_commitments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    frequency VARCHAR(10) NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY')),
    first_date DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_recurring_commitments_user ON recurring_commitments(user_id);

CREATE TABLE recurring_postings (
    commitment_id UUID NOT NULL REFERENCES recurring_commitments(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    PRIMARY KEY (commitment_id, due_date)
);

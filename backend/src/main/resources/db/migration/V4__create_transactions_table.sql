CREATE TABLE transactions (
    id                      UUID            PRIMARY KEY,
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id              UUID            NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
    category_id             UUID            REFERENCES categories(id) ON DELETE SET NULL,
    amount                  NUMERIC(19, 4)  NOT NULL,
    currency                CHAR(3)         NOT NULL DEFAULT 'INR',
    direction               VARCHAR(10)     NOT NULL,
    description             VARCHAR(255)    NOT NULL,
    merchant                VARCHAR(100),
    transaction_date        DATE            NOT NULL,
    posted_date             DATE,
    source                  VARCHAR(20)     NOT NULL DEFAULT 'MANUAL',
    import_batch_id         UUID,
    external_fingerprint    VARCHAR(255),
    notes                   TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trans_amount_positive
        CHECK (amount > 0),
    CONSTRAINT chk_trans_direction
        CHECK (direction IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_trans_source
        CHECK (source IN ('MANUAL', 'CSV', 'SYSTEM')),
    CONSTRAINT chk_trans_currency_len
        CHECK (LENGTH(currency) = 3)
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_account ON transactions(user_id, account_id);
CREATE INDEX idx_transactions_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_source ON transactions(user_id, source);
CREATE INDEX idx_transactions_fingerprint ON transactions(user_id, external_fingerprint)
    WHERE external_fingerprint IS NOT NULL;


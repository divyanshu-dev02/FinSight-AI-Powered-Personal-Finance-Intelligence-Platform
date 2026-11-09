CREATE TABLE import_batches (
    id                  UUID            PRIMARY KEY,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name           VARCHAR(255)    NOT NULL,
    file_hash           VARCHAR(64)     NOT NULL,
    status              VARCHAR(30)     NOT NULL DEFAULT 'PENDING',
    total_rows          INT             NOT NULL DEFAULT 0,
    successful_rows     INT             NOT NULL DEFAULT 0,
    failed_rows         INT             NOT NULL DEFAULT 0,
    duplicate_rows      INT             NOT NULL DEFAULT 0,
    error_summary       JSONB,
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_import_batch_status
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_import_batches_user ON import_batches(user_id, created_at DESC);
CREATE INDEX idx_import_batches_hash ON import_batches(user_id, file_hash);

-- Add foreign key constraint to transactions table
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_import_batch
    FOREIGN KEY (import_batch_id)
    REFERENCES import_batches(id)
    ON DELETE SET NULL;


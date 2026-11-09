-- Financial accounts table
CREATE TABLE financial_accounts (
    id                  UUID            PRIMARY KEY,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(100)    NOT NULL,
    type                VARCHAR(30)     NOT NULL,
    currency            CHAR(3)         NOT NULL DEFAULT 'INR',
    opening_balance     NUMERIC(19, 4)  NOT NULL DEFAULT 0.0000,
    institution_label   VARCHAR(100),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_account_type
        CHECK (type IN ('CASH', 'BANK_ACCOUNT', 'CREDIT_CARD', 'DIGITAL_WALLET', 'LOAN', 'OTHER')),
    CONSTRAINT chk_account_currency_len
        CHECK (LENGTH(currency) = 3)
);

CREATE INDEX idx_accounts_user_id ON financial_accounts(user_id);
CREATE INDEX idx_accounts_active ON financial_accounts(user_id, is_active);

-- Categories table (system defaults have user_id = NULL)
CREATE TABLE categories (
    id                  UUID            PRIMARY KEY,
    user_id             UUID            REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(100)    NOT NULL,
    type                VARCHAR(30)     NOT NULL,
    icon                VARCHAR(50),
    color               VARCHAR(20),
    parent_id           UUID            REFERENCES categories(id) ON DELETE SET NULL,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_category_type
        CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER'))
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Seed default global system categories (user_id IS NULL)
INSERT INTO categories (id, user_id, name, type, icon, color, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'Salary', 'INCOME', 'briefcase', '#10B981', TRUE),
    ('00000000-0000-0000-0000-000000000002', NULL, 'Freelance', 'INCOME', 'laptop', '#34D399', TRUE),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Investments', 'INCOME', 'trending-up', '#059669', TRUE),
    ('00000000-0000-0000-0000-000000000004', NULL, 'Other Income', 'INCOME', 'plus-circle', '#6EE7B7', TRUE),
    ('00000000-0000-0000-0000-000000000010', NULL, 'Groceries', 'EXPENSE', 'shopping-cart', '#EF4444', TRUE),
    ('00000000-0000-0000-0000-000000000011', NULL, 'Dining Out', 'EXPENSE', 'utensils', '#F87171', TRUE),
    ('00000000-0000-0000-0000-000000000012', NULL, 'Rent & Housing', 'EXPENSE', 'home', '#DC2626', TRUE),
    ('00000000-0000-0000-0000-000000000013', NULL, 'Utilities', 'EXPENSE', 'zap', '#B91C1C', TRUE),
    ('00000000-0000-0000-0000-000000000014', NULL, 'Transportation', 'EXPENSE', 'car', '#EA580C', TRUE),
    ('00000000-0000-0000-0000-000000000015', NULL, 'Entertainment', 'EXPENSE', 'film', '#D97706', TRUE),
    ('00000000-0000-0000-0000-000000000016', NULL, 'Healthcare', 'EXPENSE', 'activity', '#0284C7', TRUE),
    ('00000000-0000-0000-0000-000000000017', NULL, 'Education', 'EXPENSE', 'book-open', '#6366F1', TRUE),
    ('00000000-0000-0000-0000-000000000018', NULL, 'Shopping', 'EXPENSE', 'shopping-bag', '#8B5CF6', TRUE),
    ('00000000-0000-0000-0000-000000000019', NULL, 'Personal Care', 'EXPENSE', 'smile', '#EC4899', TRUE),
    ('00000000-0000-0000-0000-000000000020', NULL, 'Account Transfer', 'TRANSFER', 'arrow-left-right', '#6B7280', TRUE);


-- V6: Update transaction source constraint for PDF/Excel support and seed demo user

-- 1. Update source constraint on transactions table
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_trans_source;
ALTER TABLE transactions ADD CONSTRAINT chk_trans_source
    CHECK (source IN ('MANUAL', 'CSV', 'PDF', 'EXCEL', 'SYSTEM'));

-- 2. Seed default demo user: divyanshu@finsight.local / SecurePassword123!
INSERT INTO users (
    id, email, password_hash, display_name, base_currency, time_zone, locale, account_status, created_at, updated_at
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'divyanshu@finsight.local',
    '$2a$10$R/fcCO0HojITUK3RjKMo1ee8ul0AKMtZzsHBDyUkVa3olLxwDIFVW',
    'Divyanshu (Demo)',
    'INR',
    'Asia/Kolkata',
    'en-IN',
    'ACTIVE',
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    account_status = 'ACTIVE',
    updated_at = NOW();

-- 3. Seed default demo account for demo user if none exists
INSERT INTO financial_accounts (
    id, user_id, name, type, currency, opening_balance, institution_label, is_active, created_at, updated_at
)
SELECT
    '22222222-2222-2222-2222-222222222222',
    u.id,
    'HDFC Salary Account',
    'BANK_ACCOUNT',
    'INR',
    50000.0000,
    'HDFC Bank',
    TRUE,
    NOW(),
    NOW()
FROM users u
WHERE u.email = 'divyanshu@finsight.local'
ON CONFLICT (id) DO NOTHING;

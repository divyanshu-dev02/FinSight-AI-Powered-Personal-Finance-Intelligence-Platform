INSERT INTO users (
    id, email, password_hash, display_name, base_currency, time_zone, locale, account_status
) VALUES (
    'd6422a31-8c2d-4cb8-9a56-b0ffccb54bda', 'demo@finsight.local', 'disabled',
    'FinSight Demo', 'INR', 'Asia/Kolkata', 'en-IN', 'SUSPENDED'
) ON CONFLICT DO NOTHING;

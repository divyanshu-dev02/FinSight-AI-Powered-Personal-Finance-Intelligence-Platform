CREATE TEMP TABLE demo_seed_context ON COMMIT DROP AS
SELECT id AS user_id, (now() AT TIME ZONE time_zone)::date AS today,
       date_trunc('month', now() AT TIME ZONE time_zone)::date AS month_start,
       CASE WHEN email = 'demo@finsight.local' THEN 'finsight-hosted-demo-v1/' ELSE 'finsight-demo-v1/' END AS fixture_prefix
FROM users
WHERE CASE WHEN current_setting('finsight.demo_mode', true) = 'hosted'
      THEN id = 'd6422a31-8c2d-4cb8-9a56-b0ffccb54bda' AND email = 'demo@finsight.local'
      ELSE id = '11111111-1111-1111-1111-111111111111' AND email = 'divyanshu@finsight.local'
      END;

INSERT INTO financial_accounts (id, user_id, name, type, currency, opening_balance, institution_label)
SELECT md5(demo.fixture_prefix || 'account/' || fixture.key)::uuid, demo.user_id, fixture.name,
       fixture.type, fixture.currency, fixture.opening_balance, 'Synthetic demo'
FROM demo_seed_context demo
CROSS JOIN (VALUES
    ('everyday', 'Demo Everyday', 'BANK_ACCOUNT', 'INR', 18000),
    ('savings', 'Demo Savings', 'BANK_ACCOUNT', 'INR', 22000),
    ('travel', 'Demo Travel Wallet', 'DIGITAL_WALLET', 'USD', 300)
) AS fixture(key, name, type, currency, opening_balance)
ON CONFLICT DO NOTHING;

-- Skip future dates so the ledger contains only posted activity.
WITH sample_rows AS (
    SELECT * FROM (VALUES
        ('payroll',       -1,  1, 'everyday', 'INR', 62000.00, 'CREDIT', 'Salary',          'Demo Studio',       'Monthly salary'),
        ('rent',          -1,  3, 'everyday', 'INR', 16500.00, 'DEBIT',  'Rent & Housing',  'Demo Homes',        'Apartment rent'),
        ('internet',      -2,  5, 'everyday', 'INR',   799.00, 'DEBIT',  'Utilities',       'Demo Broadband',   'Internet bill'),
        ('internet',      -1,  5, 'everyday', 'INR',   799.00, 'DEBIT',  'Utilities',       'Demo Broadband',   'Internet bill'),
        ('streaming',     -1,  9, 'everyday', 'INR',   299.00, 'DEBIT',  'Entertainment',   'Demo Stream',      'Streaming subscription'),
        ('groceries',     -1,  7, 'everyday', 'INR',  2100.00, 'DEBIT',  'Groceries',        'Demo Fresh Market','Weekly groceries'),
        ('groceries-2',   -1, 17, 'everyday', 'INR',  1575.00, 'DEBIT',  'Groceries',        'Demo Fresh Market','Weekly groceries'),
        ('dining',        -1, 14, 'everyday', 'INR',   650.00, 'DEBIT',  'Dining Out',      'Demo Cafe',        'Dinner'),
        ('commute',       -1, 15, 'everyday', 'INR',  1200.00, 'DEBIT',  'Transportation', 'Demo Metro',       'Metro pass'),
        ('mobile',        -1, 25, 'everyday', 'INR',   499.00, 'DEBIT',  'Utilities',       'Demo Mobile',      'Mobile phone plan'),
        ('travel-pass',   -1, 20, 'travel',   'USD',    18.00, 'DEBIT',  'Transportation', 'Demo Rail',        'Travel day pass'),
        ('payroll',        0,  1, 'everyday', 'INR', 62000.00, 'CREDIT', 'Salary',          'Demo Studio',       'Monthly salary'),
        ('rent',           0,  3, 'everyday', 'INR', 16500.00, 'DEBIT',  'Rent & Housing',  'Demo Homes',        'Apartment rent'),
        ('internet',       0,  5, 'everyday', 'INR',   999.00, 'DEBIT',  'Utilities',       'Demo Broadband',   'Internet bill'),
        ('groceries',      0,  7, 'everyday', 'INR',  2450.00, 'DEBIT',  'Groceries',        'Demo Fresh Market','Weekly groceries'),
        ('streaming',      0,  9, 'everyday', 'INR',   299.00, 'DEBIT',  'Entertainment',   'Demo Stream',      'Streaming subscription'),
        ('dining',         0, 11, 'everyday', 'INR',  1750.00, 'DEBIT',  'Dining Out',      'Demo Cafe',        'Weekend dinner'),
        ('electricity',    0, 13, 'everyday', 'INR',  1500.00, 'DEBIT',  'Utilities',       'Demo Energy',      'Electricity bill'),
        ('freelance',      0, 15, 'everyday', 'INR',  8500.00, 'CREDIT', 'Freelance',        'Demo Design Co',   'Freelance design project'),
        ('groceries-2',    0, 17, 'everyday', 'INR',  1980.00, 'DEBIT',  'Groceries',        'Demo Fresh Market','Weekly groceries'),
        ('commute',        0, 18, 'everyday', 'INR',  1200.00, 'DEBIT',  'Transportation', 'Demo Metro',       'Metro pass'),
        ('headphones',     0, 20, 'everyday', 'INR',  6499.00, 'DEBIT',  'Shopping',        'Demo Electronics', 'One-off headphones purchase'),
        ('groceries-3',    0, 23, 'everyday', 'INR',  1350.00, 'DEBIT',  'Groceries',        'Demo Fresh Market','Weekly groceries'),
        ('mobile',         0, 25, 'everyday', 'INR',   499.00, 'DEBIT',  'Utilities',       'Demo Mobile',      'Mobile phone plan'),
        ('travel-pass',    0, 20, 'travel',   'USD',    28.00, 'DEBIT',  'Transportation', 'Demo Rail',        'Travel day pass'),
        ('travel-book',    0, 22, 'travel',   'USD',    36.00, 'DEBIT',  'Education',       'Demo Books',       'Travel guide')
    ) AS row(key, month_offset, day, account_key, currency, amount, direction, category, merchant, description)
), dated AS (
    SELECT rows.*, demo.user_id, demo.today, demo.fixture_prefix,
           (demo.month_start + make_interval(months => rows.month_offset))::date AS fixture_month,
           (demo.month_start + make_interval(months => rows.month_offset))::date + (rows.day - 1) AS posted_date
    FROM sample_rows rows CROSS JOIN demo_seed_context demo
)
INSERT INTO transactions (id, user_id, account_id, category_id, amount, currency, direction,
                          description, merchant, transaction_date, posted_date, source)
SELECT md5(dated.fixture_prefix || 'transaction/' || dated.fixture_month || '/' || dated.key)::uuid,
       dated.user_id, accounts.id, categories.id, dated.amount, dated.currency, dated.direction,
       dated.description, dated.merchant, dated.posted_date, dated.posted_date, 'SYSTEM'
FROM dated
JOIN financial_accounts accounts ON accounts.id = md5(dated.fixture_prefix || 'account/' || dated.account_key)::uuid
                                 AND accounts.user_id = dated.user_id
JOIN categories ON categories.user_id IS NULL AND categories.name = dated.category
WHERE dated.posted_date <= dated.today
ON CONFLICT DO NOTHING;

-- Linked transfer legs exercise the exclusion from spending and income reports.
INSERT INTO transactions (id, user_id, account_id, category_id, amount, currency, direction, description,
                          merchant, transaction_date, posted_date, source, is_transfer,
                          transfer_account_id, transfer_transaction_id)
SELECT md5(demo.fixture_prefix || 'transfer/' || demo.month_start || '/' || leg.direction)::uuid, demo.user_id,
       source.id, category.id, 4500.00, 'INR', leg.direction, 'Demo savings transfer', 'Demo Savings',
       demo.month_start + 18, demo.month_start + 18, 'SYSTEM', true,
       destination.id, md5(demo.fixture_prefix || 'transfer/' || demo.month_start || '/' || leg.other_direction)::uuid
FROM demo_seed_context demo
CROSS JOIN (VALUES ('DEBIT', 'everyday', 'savings', 'CREDIT'), ('CREDIT', 'savings', 'everyday', 'DEBIT'))
    AS leg(direction, account_key, counterparty_key, other_direction)
JOIN financial_accounts source ON source.id = md5(demo.fixture_prefix || 'account/' || leg.account_key)::uuid
JOIN financial_accounts destination ON destination.id = md5(demo.fixture_prefix || 'account/' || leg.counterparty_key)::uuid
JOIN categories category ON category.user_id IS NULL AND category.name = 'Account Transfer'
WHERE source.user_id = demo.user_id AND destination.user_id = demo.user_id
  AND demo.month_start + 18 <= demo.today
ON CONFLICT DO NOTHING;

INSERT INTO monthly_budgets (id, user_id, category_id, month, currency, amount)
SELECT md5(demo.fixture_prefix || 'budget/' || demo.month_start || '/' || fixture.category)::uuid,
       demo.user_id, category.id, demo.month_start, 'INR', fixture.amount
FROM demo_seed_context demo
CROSS JOIN (VALUES ('Groceries', 6500), ('Dining Out', 1500), ('Utilities', 3200), ('Shopping', 5000))
    AS fixture(category, amount)
JOIN categories category ON category.user_id IS NULL AND category.name = fixture.category
ON CONFLICT DO NOTHING;

INSERT INTO savings_goals (id, user_id, name, currency, target_amount, saved_amount, target_date)
SELECT md5(demo.fixture_prefix || 'goal/' || fixture.key)::uuid, demo.user_id, fixture.name, 'INR',
       fixture.target_amount, fixture.saved_amount, demo.today + fixture.days
FROM demo_seed_context demo
CROSS JOIN (VALUES
    ('emergency', 'Demo Emergency Fund', 100000, 36000, 180),
    ('travel', 'Demo Weekend Trip', 25000, 18500, 55)
) AS fixture(key, name, target_amount, saved_amount, days)
ON CONFLICT DO NOTHING;

INSERT INTO recurring_commitments (id, user_id, account_id, name, direction, amount, frequency, first_date, active)
SELECT md5(demo.fixture_prefix || 'commitment/' || fixture.key)::uuid, demo.user_id, account.id, fixture.name,
       fixture.direction, fixture.amount, 'MONTHLY', demo.month_start + fixture.day_offset, true
FROM demo_seed_context demo
CROSS JOIN (VALUES
    ('salary', 'Demo Salary', 'CREDIT', 62000, 0),
    ('rent', 'Demo Apartment Rent', 'DEBIT', 16500, 2),
    ('internet', 'Demo Internet Bill', 'DEBIT', 999, 4),
    ('electricity', 'Demo Electricity Bill', 'DEBIT', 1500, 12),
    ('streaming', 'Demo Streaming Subscription', 'DEBIT', 299, 8),
    ('mobile', 'Demo Mobile Plan', 'DEBIT', 499, 24)
) AS fixture(key, name, direction, amount, day_offset)
JOIN financial_accounts account ON account.id = md5(demo.fixture_prefix || 'account/everyday')::uuid
WHERE account.user_id = demo.user_id
ON CONFLICT DO NOTHING;

-- Reconcile fixtures already posted this month. Later occurrences remain upcoming.
INSERT INTO recurring_postings (commitment_id, due_date, transaction_id)
SELECT commitment.id, transaction.transaction_date, transaction.id
FROM demo_seed_context demo
CROSS JOIN (VALUES ('salary', 'payroll', 0), ('rent', 'rent', 2), ('internet', 'internet', 4),
                   ('electricity', 'electricity', 12), ('streaming', 'streaming', 8), ('mobile', 'mobile', 24))
    AS fixture(commitment_key, transaction_key, day_offset)
JOIN recurring_commitments commitment ON commitment.id = md5(demo.fixture_prefix || 'commitment/' || fixture.commitment_key)::uuid
JOIN transactions transaction ON transaction.id = md5(demo.fixture_prefix || 'transaction/' || demo.month_start
                                                       || '/' || fixture.transaction_key)::uuid
WHERE commitment.user_id = demo.user_id AND transaction.user_id = demo.user_id
  AND transaction.transaction_date = demo.month_start + fixture.day_offset
  AND commitment.active AND commitment.frequency = 'MONTHLY'
  AND commitment.account_id = transaction.account_id AND commitment.direction = transaction.direction
  AND commitment.first_date <= transaction.transaction_date
  AND least(extract(day FROM commitment.first_date),
            extract(day FROM (demo.month_start + interval '1 month - 1 day'))) = extract(day FROM transaction.transaction_date)
ON CONFLICT DO NOTHING;

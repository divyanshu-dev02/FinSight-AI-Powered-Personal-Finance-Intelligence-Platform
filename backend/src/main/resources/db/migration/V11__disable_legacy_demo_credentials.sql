UPDATE users
SET password_hash = 'disabled', account_status = 'SUSPENDED', updated_at = NOW()
WHERE id = '11111111-1111-1111-1111-111111111111' AND email = 'divyanshu@finsight.local';

UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND revoked_at IS NULL;

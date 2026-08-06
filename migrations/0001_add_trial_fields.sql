-- Add trial fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active';

-- Create index for subscription_status for performance
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- Update existing users to have active subscription status
UPDATE users SET subscription_status = 'active' WHERE subscription_status IS NULL;

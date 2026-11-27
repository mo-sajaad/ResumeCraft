-- Up Migration

-- Monthly usage check: WHERE user_id = $1 AND type = $2 AND created_at >= ...
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_type_created_at
  ON ai_usage (user_id, type, created_at);

-- One row per provider payment. NULL IDs are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS unique_payment_transactions_provider_payment_id
  ON payment_transactions (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- Foreign keys that had no index.
CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id
  ON payment_transactions (subscription_id);

-- Fail with a clear message when the free plan is missing, instead of a
-- NULL plan_id error. Same error code as before.
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id
  FROM plans
  WHERE code = 'free'
  LIMIT 1;

  IF free_plan_id IS NULL THEN
    RAISE EXCEPTION 'No plan with code ''free'' exists; run the database migrations'
      USING ERRCODE = 'not_null_violation';
  END IF;

  INSERT INTO subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    free_plan_id,
    'active',
    NOW(),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep updated_at current on every update, whatever the caller sends.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_resumes_updated_at
  BEFORE UPDATE ON resumes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_work_experiences_updated_at
  BEFORE UPDATE ON work_experiences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_educations_updated_at
  BEFORE UPDATE ON educations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_cover_letters_updated_at
  BEFORE UPDATE ON cover_letters FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trigger_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS trigger_feature_flags_updated_at ON feature_flags;
DROP TRIGGER IF EXISTS trigger_cover_letters_updated_at ON cover_letters;
DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS trigger_educations_updated_at ON educations;
DROP TRIGGER IF EXISTS trigger_work_experiences_updated_at ON work_experiences;
DROP TRIGGER IF EXISTS trigger_resumes_updated_at ON resumes;
DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trigger_user_preferences_updated_at ON user_preferences;
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();

-- Restore the baseline version of the trigger function.
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id
  FROM plans
  WHERE code = 'free'
  LIMIT 1;

  INSERT INTO subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    free_plan_id,
    'active',
    NOW(),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS idx_payment_transactions_subscription_id;
DROP INDEX IF EXISTS idx_subscriptions_plan_id;
DROP INDEX IF EXISTS idx_auth_identities_user_id;
DROP INDEX IF EXISTS unique_payment_transactions_provider_payment_id;
DROP INDEX IF EXISTS idx_ai_usage_user_type_created_at;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


CREATE EXTENSION IF NOT EXISTS citext;


-- =========================
-- Users / Auth
-- =========================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone_e164 TEXT,
  location_text TEXT,
  linkedin_url TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('password', 'google')),
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subject)
);

-- =========================
-- Preferences / Settings
-- =========================
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_insights BOOLEAN NOT NULL DEFAULT FALSE,
  job_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- Plans / Billing
-- =========================

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('none', 'monthly', 'lifetime')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- AI Limits
  monthly_resume_limit INTEGER,
  monthly_cover_letter_limit INTEGER,

  -- Feature Flags
  has_advanced_ai BOOLEAN DEFAULT FALSE,
  has_resume_analysis BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired', 'trialing')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id 
ON payment_transactions(user_id);

-- =========================
-- AI Usage Tracking
-- =========================

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('resume', 'cover_letter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);


INSERT INTO plans 
(code, name, billing_interval, amount_cents, monthly_resume_limit, monthly_cover_letter_limit, has_advanced_ai, has_resume_analysis)
VALUES
('free', 'Free', 'none', 0, 1, 1, FALSE, FALSE),
('premium', 'Premium', 'monthly', 1999, NULL, NULL, TRUE, TRUE),
('pro', 'Pro', 'monthly', 3999, NULL, NULL, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;


-- =========================
-- Resume Documents
-- =========================
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Resume',
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone_e164 TEXT,
  location_text TEXT,
  linkedin_url TEXT,
  ats_score NUMERIC(5,2),
  template_key TEXT,
  summary TEXT,
  generated_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_last_edited_at ON resumes(last_edited_at DESC);

CREATE TABLE resume_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (resume_id, skill_name)
);

CREATE INDEX idx_resume_skills_resume_id ON resume_skills(resume_id);

CREATE TABLE work_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  start_label TEXT NOT NULL,
  end_label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_experiences_resume_id ON work_experiences(resume_id);

CREATE TABLE educations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  education_level TEXT NOT NULL CHECK (
    education_level IN ('High School', 'Bachelor''s Degree', 'Master''s Degree', 'PhD')
  ),
  degree TEXT,
  field_of_study TEXT,
  high_school_qualification TEXT,
  grades TEXT,
  graduation_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_educations_resume_id ON educations(resume_id);

CREATE TABLE education_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  education_id UUID NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  grade TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_education_subjects_education_id ON education_subjects(education_id);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  description TEXT NOT NULL,
  start_label TEXT NOT NULL,
  end_label TEXT NOT NULL,
  github_url TEXT,
  live_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_resume_id ON projects(resume_id);

CREATE TABLE project_technologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  technology_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, technology_name)
);

CREATE INDEX idx_project_technologies_project_id ON project_technologies(project_id);

-- =========================
-- Cover Letter Documents
-- =========================
CREATE TABLE cover_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Cover Letter',
  full_name TEXT,
  email CITEXT,
  phone_e164 TEXT,
  address_text TEXT,
  company_name TEXT,
  position_title TEXT,
  hiring_manager TEXT,
  opening_paragraph TEXT,
  body_paragraphs TEXT,
  closing_paragraph TEXT,
  generated_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cover_letters_user_id ON cover_letters(user_id);

-- =========================
-- AI Generation Logs
-- =========================
CREATE TABLE ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('resume', 'cover_letter')),
  document_id UUID,
  prompt_snapshot JSONB,
  model_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error_message TEXT,
  output_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_generations_user_id ON ai_generations(user_id);
CREATE INDEX idx_ai_generations_document_lookup ON ai_generations(document_type, document_id);

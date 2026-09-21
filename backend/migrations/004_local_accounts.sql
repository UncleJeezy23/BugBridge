CREATE TABLE IF NOT EXISTS local_accounts (
  email TEXT PRIMARY KEY REFERENCES bugbridge_access(email) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_invites (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES bugbridge_access(email) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_account_invites_email ON account_invites(email);
CREATE INDEX IF NOT EXISTS idx_account_invites_expires_at ON account_invites(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES bugbridge_access(email) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

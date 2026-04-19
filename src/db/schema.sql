-- AI Sales Team: schema for campaigns, prospects, stages, events, human inputs.
-- SQLite. Keep it small. Envelopes stored as JSON for flexibility.

CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  pipeline    TEXT NOT NULL,           -- e.g. "outbound-v1@0.1"
  icp         TEXT NOT NULL,           -- JSON
  created_at  TEXT NOT NULL,
  created_by  TEXT
);

CREATE TABLE IF NOT EXISTS prospects (
  id            TEXT PRIMARY KEY,      -- linkedin slug
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  linkedin_url  TEXT,
  x_handle      TEXT,
  company       TEXT,
  title         TEXT,
  current_stage TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_prospects_stage    ON prospects(current_stage);

-- One row per (prospect, stage). StageEnvelope serialized as JSON.
CREATE TABLE IF NOT EXISTS stage_envelopes (
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  stage_id    TEXT NOT NULL,
  status      TEXT NOT NULL,           -- pending|in_progress|passed|rejected|awaiting_human|pending_worker
  envelope    TEXT NOT NULL,           -- JSON: StageEnvelope (attempts, inputs, outputs)
  started_at  TEXT,
  ended_at    TEXT,
  claim_id         TEXT,
  claimed_by       TEXT,
  claim_expires_at TEXT,
  PRIMARY KEY (prospect_id, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_envelope_status ON stage_envelopes(status);
-- idx_envelope_claim created in migrate() after claim_expires_at col added

-- Append-only event log. Activity feed reads from here.
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  TEXT NOT NULL,
  prospect_id  TEXT,
  stage_id     TEXT,
  kind         TEXT NOT NULL,          -- stage_start|attempt|stage_pass|stage_reject|human_input|stage_advance
  payload      TEXT NOT NULL,          -- JSON: full PipelineEvent
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(campaign_id, id);
CREATE INDEX IF NOT EXISTS idx_events_prospect ON events(prospect_id, id);

-- v2: accounts (company separated from person)
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  domain     TEXT,
  industry   TEXT,
  created_at TEXT NOT NULL
);

-- v2: tags (many-to-many with prospects)
CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS prospect_tags (
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prospect_id, tag_id)
);

-- v2: score snapshots (track score over time)
CREATE TABLE IF NOT EXISTS score_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL,
  rationale   TEXT,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_prospect ON score_snapshots(prospect_id, id);

-- Waitlist signups (public landing page form).
CREATE TABLE IF NOT EXISTS waitlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  source       TEXT,                    -- 'landing' | 'invite'
  note         TEXT,                    -- optional "why interested"
  user_agent   TEXT,
  ip_hash      TEXT,                    -- sha256(ip)[:16], cheap dedupe
  created_at   TEXT NOT NULL,
  notified_at  TEXT,                    -- when confirmation sent
  status       TEXT DEFAULT 'pending'   -- pending | notified | invited | blocked
);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- Human inputs — queryable, not just embedded in envelope.
CREATE TABLE IF NOT EXISTS human_inputs (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  stage_id    TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL,
  kind        TEXT NOT NULL,           -- approve|reject|edit|comment|nudge|override
  payload     TEXT NOT NULL,           -- JSON
  blocking    INTEGER NOT NULL DEFAULT 0,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_human_prospect ON human_inputs(prospect_id);
CREATE INDEX IF NOT EXISTS idx_human_stage    ON human_inputs(prospect_id, stage_id);

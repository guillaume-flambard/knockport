-- knockport, schema batch A.
-- The recruiters table arrives in batch B, with companies.recruiter_id.
--
-- Personal data rule, valid everywhere in this file:
-- no IP addresses are stored, not even hashed. Session events carry only
-- the typed command and its relative timestamp. A candidate's name and email
-- exist only if the candidate submitted the contact form.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  github_org  TEXT,
  created_at  INTEGER NOT NULL
);

-- A journey is public by design: its link is pasted into a job posting.
-- Hence a readable slug in the URL rather than an opaque identifier.
-- It is the evidence that is protected, not the journey.
CREATE TABLE IF NOT EXISTS journeys (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  banner        TEXT NOT NULL,
  -- Notice shown in gray under the banner and in the footer of the
  -- accessible page. A demo journey built from a company's public surface
  -- must say it is not official: without it, a page speaking in the first
  -- person plural reads like the company's real recruitment page.
  notice        TEXT,
  content       TEXT NOT NULL,
  cv_url        TEXT,
  book_url      TEXT,
  published_at  INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  journey_id  TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  at_ms       INTEGER NOT NULL,
  input       TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_journey_session
  ON session_events (journey_id, session_id, at_ms);

CREATE INDEX IF NOT EXISTS idx_events_created
  ON session_events (created_at);

CREATE TABLE IF NOT EXISTS candidate_contacts (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  egg_found   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_journey
  ON candidate_contacts (journey_id, created_at);

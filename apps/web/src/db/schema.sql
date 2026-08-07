-- knockport, schema du lot A.
-- La table recruiters arrive au lot B, avec companies.recruiter_id.
--
-- Regle de donnees personnelles, valable partout dans ce fichier:
-- aucune adresse IP n'est stockee, meme hachee. Les evenements de session ne
-- portent que la commande tapee et son horodatage relatif. Le nom et le mail
-- d'un candidat n'existent que s'il a lui-meme envoye le formulaire de contact.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  github_org  TEXT,
  created_at  INTEGER NOT NULL
);

-- Un parcours est public par conception: son lien est colle dans une offre
-- d'emploi. D'ou un slug lisible dans l'URL plutot qu'un identifiant opaque.
-- Ce sont les preuves qui sont protegees, pas le parcours.
CREATE TABLE IF NOT EXISTS journeys (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  banner        TEXT NOT NULL,
  -- Mention affichee en gris sous la banniere, et en pied de la page
  -- accessible. Un parcours de demonstration construit depuis la surface
  -- publique d'une entreprise doit dire qu'il n'est pas officiel: sans ca,
  -- une page qui parle a la premiere personne du pluriel se lit comme la
  -- vraie page de recrutement de cette entreprise.
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

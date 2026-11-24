CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  username_lc   TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Live rooms. `data` holds host, member list and the full game state,
-- so a running game survives a server restart.
CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT PRIMARY KEY,
  host_id    TEXT NOT NULL,
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id          BIGSERIAL PRIMARY KEY,
  room_code   TEXT NOT NULL,
  winner_id   TEXT,
  rounds      INT NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_scores (
  match_id  BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  name      TEXT NOT NULL,
  score     INT NOT NULL,
  PRIMARY KEY (match_id, player_id)
);

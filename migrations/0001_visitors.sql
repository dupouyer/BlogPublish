-- Run once on the Cloudflare D1 database bound as VISITOR_DB.
CREATE TABLE IF NOT EXISTS visitor_counters (
  path TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visitor_uniques (
  visitor_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS visitor_visit_locks (
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, path)
);

CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL       PRIMARY KEY,
  user_id     INTEGER      NOT NULL,
  username    VARCHAR(50),
  event_type  VARCHAR(50)  NOT NULL,
  entity_type VARCHAR(20),
  entity_id   INTEGER,
  summary     TEXT,
  meta        JSONB,
  created_at  TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user_id    ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_event_type ON activities(event_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

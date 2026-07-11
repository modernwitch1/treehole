CREATE TABLE IF NOT EXISTS "system_announcements" (
  "id" BIGSERIAL PRIMARY KEY,
  "title" VARCHAR(120) NOT NULL,
  "body" TEXT NOT NULL,
  "link_url" TEXT,
  "audience" VARCHAR(32) NOT NULL DEFAULT 'all',
  "published_by" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "system_announcements_created_at_idx"
  ON "system_announcements" ("created_at" DESC);

-- Defense-in-depth community safety foundation.

ALTER TYPE "report_target" ADD VALUE IF NOT EXISTS 'conversation';
ALTER TYPE "report_target" ADD VALUE IF NOT EXISTS 'direct_message';
ALTER TYPE "report_target" ADD VALUE IF NOT EXISTS 'chatroom_message';

DO $$ BEGIN
  CREATE TYPE "moderation_surface" AS ENUM ('post', 'comment', 'direct_message', 'chatroom_message', 'upload');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "moderation_case_status" AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "moderation_decision" AS ENUM ('allow', 'warn', 'hide', 'delete', 'suspend', 'ban');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "policy_acceptance_source" AS ENUM ('registration', 'new_user_daily', 'publish', 'private_message', 'rules_update');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sanction_type" AS ENUM ('warning', 'mute', 'suspension', 'ban');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sanction_status" AS ENUM ('active', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "appeal_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "moderation_labels" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "moderation_labels" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "evidence_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "priority" SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "registration_requests"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "policy_version" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "policy_accepted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "policy_accepted_ip" INET,
  ADD COLUMN IF NOT EXISTS "policy_accepted_user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "credentials_purged_at" TIMESTAMPTZ;

ALTER TABLE "uploads"
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "direct_messages"
  ADD COLUMN IF NOT EXISTS "status" "content_status" NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "moderation_labels" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "sender_ip" INET,
  ADD COLUMN IF NOT EXISTS "sender_user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "chatrooms"
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "chatroom_messages"
  ADD COLUMN IF NOT EXISTS "sender_user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "content_status" NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "moderation_labels" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "chatroom_messages"
SET "status" = 'pending_review', "legal_hold" = TRUE
WHERE "is_flagged" = TRUE AND "status" = 'published';

UPDATE "chatrooms" AS room
SET "legal_hold" = TRUE
WHERE EXISTS (
  SELECT 1
  FROM "chatroom_messages" AS message
  WHERE message."chatroom_id" = room."id" AND message."is_flagged" = TRUE
);

CREATE INDEX IF NOT EXISTS "direct_messages_status_created_at_idx"
  ON "direct_messages" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "chatroom_messages_status_created_at_idx"
  ON "chatroom_messages" ("status", "created_at" DESC);

-- Prevent concurrent duplicate open reports while retaining report history.
CREATE UNIQUE INDEX IF NOT EXISTS "reports_one_open_per_reporter_target"
  ON "reports" ("reporter_id", "target_type", "target_id")
  WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "policy_acceptances" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "policy_version" VARCHAR(32) NOT NULL,
  "source" "policy_acceptance_source" NOT NULL,
  "ip" INET,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "policy_acceptances_user_version_created_idx"
  ON "policy_acceptances" ("user_id", "policy_version", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "policy_acceptances_source_created_idx"
  ON "policy_acceptances" ("source", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "moderation_cases" (
  "id" BIGSERIAL PRIMARY KEY,
  "surface" "moderation_surface" NOT NULL,
  "target_id" BIGINT,
  "author_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "moderation_case_status" NOT NULL DEFAULT 'pending',
  "risk_level" SMALLINT NOT NULL DEFAULT 1,
  "reason_codes" JSONB,
  "matched_rules" JSONB,
  "content_hash" VARCHAR(64) NOT NULL,
  "content_excerpt" VARCHAR(500),
  "source_ip" INET,
  "source_user_agent" TEXT,
  "assigned_to" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "decision" "moderation_decision",
  "resolution_note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_cases_risk_level_check" CHECK ("risk_level" BETWEEN 0 AND 4)
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderation_cases_surface_target_key"
  ON "moderation_cases" ("surface", "target_id");
CREATE INDEX IF NOT EXISTS "moderation_cases_queue_idx"
  ON "moderation_cases" ("status", "risk_level" DESC, "created_at");
CREATE INDEX IF NOT EXISTS "moderation_cases_author_created_idx"
  ON "moderation_cases" ("author_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "moderation_cases_assignee_status_created_idx"
  ON "moderation_cases" ("assigned_to", "status", "created_at");

-- Move legacy manually flagged chat messages into the unified queue without
-- exposing their sender identity in the monitoring APIs.
INSERT INTO "moderation_cases" (
  "surface",
  "target_id",
  "author_id",
  "status",
  "risk_level",
  "reason_codes",
  "matched_rules",
  "content_hash",
  "content_excerpt",
  "source_ip",
  "source_user_agent",
  "legal_hold",
  "created_at",
  "updated_at"
)
SELECT
  'chatroom_message'::"moderation_surface",
  message."id",
  message."sender_id",
  'pending'::"moderation_case_status",
  3,
  '["legacy_manual_flag"]'::jsonb,
  '[]'::jsonb,
  COALESCE(message."content_hash", encode(digest(message."content", 'sha256'), 'hex')),
  LEFT(regexp_replace(message."content", '[[:space:]]+', ' ', 'g'), 500),
  message."sender_ip",
  message."sender_user_agent",
  TRUE,
  message."created_at",
  CURRENT_TIMESTAMP
FROM "chatroom_messages" AS message
WHERE message."is_flagged" = TRUE
ON CONFLICT ("surface", "target_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "sanctions" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "case_id" BIGINT REFERENCES "moderation_cases"("id") ON DELETE SET NULL,
  "type" "sanction_type" NOT NULL,
  "status" "sanction_status" NOT NULL DEFAULT 'active',
  "scope" VARCHAR(32) NOT NULL DEFAULT 'all',
  "policy_rule" VARCHAR(64),
  "reason" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ,
  "imposed_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" TIMESTAMPTZ,
  "revoke_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "sanctions_user_status_starts_idx"
  ON "sanctions" ("user_id", "status", "starts_at" DESC);
CREATE INDEX IF NOT EXISTS "sanctions_case_idx" ON "sanctions" ("case_id");
CREATE INDEX IF NOT EXISTS "sanctions_status_ends_idx" ON "sanctions" ("status", "ends_at");

CREATE TABLE IF NOT EXISTS "appeals" (
  "id" BIGSERIAL PRIMARY KEY,
  "sanction_id" BIGINT NOT NULL REFERENCES "sanctions"("id") ON DELETE CASCADE,
  "user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "status" "appeal_status" NOT NULL DEFAULT 'pending',
  "reviewed_by" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "review_note" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "appeals_status_created_idx" ON "appeals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "appeals_user_created_idx" ON "appeals" ("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "appeals_sanction_user_key"
  ON "appeals" ("sanction_id", "user_id");

CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id" BIGSERIAL PRIMARY KEY,
  "blocker_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_blocker_blocked_key"
  ON "user_blocks" ("blocker_id", "blocked_id");
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_created_idx"
  ON "user_blocks" ("blocked_id", "created_at");

DO $$ BEGIN
  CREATE TYPE "conversation_status" AS ENUM ('pending', 'active', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "dm_allowed" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" BIGSERIAL PRIMARY KEY,
  "initiator_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "origin_post_id" BIGINT REFERENCES "posts"("id") ON DELETE SET NULL,
  "status" "conversation_status" NOT NULL DEFAULT 'pending',
  "blocked_by_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
  "last_message_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" BIGSERIAL PRIMARY KEY,
  "conversation_id" BIGINT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content_md" TEXT NOT NULL,
  "content_html" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversations_initiator_id_last_message_at_idx"
  ON "conversations" ("initiator_id", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "conversations_recipient_id_last_message_at_idx"
  ON "conversations" ("recipient_id", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "conversations_status_last_message_at_idx"
  ON "conversations" ("status", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "direct_messages_conversation_id_created_at_idx"
  ON "direct_messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "direct_messages_sender_id_created_at_idx"
  ON "direct_messages" ("sender_id", "created_at" DESC);

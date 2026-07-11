ALTER TABLE "sensitive_words"
  ADD COLUMN IF NOT EXISTS "hit_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "sensitive_words_enabled_action_idx"
  ON "sensitive_words" ("enabled", "action");

CREATE INDEX IF NOT EXISTS "sensitive_words_category_idx"
  ON "sensitive_words" ("category");

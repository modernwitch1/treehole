-- 商家后台与论坛账号彻底分离。
-- 旧 food_only 账号会被复制为商家后台账号、撤销论坛会话并停用；论坛用户表不再保存商家账号。

CREATE TYPE "food_staff_account_status" AS ENUM ('active', 'suspended', 'disabled');
CREATE TYPE "food_product_status" AS ENUM ('draft', 'pending_review', 'published', 'hidden', 'deleted');
ALTER TYPE "moderation_surface" ADD VALUE IF NOT EXISTS 'food_product';

ALTER TABLE "food_posts"
  ADD COLUMN "staff_account_id" BIGINT,
  ALTER COLUMN "author_id" DROP NOT NULL;

ALTER TABLE "food_review_replies"
  ADD COLUMN "staff_account_id" BIGINT,
  ALTER COLUMN "author_id" DROP NOT NULL;

ALTER TABLE "uploads"
  ADD COLUMN "staff_account_id" BIGINT,
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE TABLE "food_staff_accounts" (
  "id" BIGSERIAL NOT NULL,
  "email" CITEXT NOT NULL,
  "display_name" VARCHAR(80) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "status" "food_staff_account_status" NOT NULL DEFAULT 'active',
  "last_login_at" TIMESTAMPTZ,
  "last_login_ip" INET,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "food_staff_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_merchant_portal_staff" (
  "id" BIGSERIAL NOT NULL,
  "merchant_id" BIGINT NOT NULL,
  "account_id" BIGINT NOT NULL,
  "role" "food_staff_role" NOT NULL DEFAULT 'editor',
  "status" "food_staff_status" NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_merchant_portal_staff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_merchant_portal_invitations" (
  "id" UUID NOT NULL,
  "merchant_id" BIGINT NOT NULL,
  "email" CITEXT NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "role" "food_staff_role" NOT NULL DEFAULT 'editor',
  "status" "food_invitation_status" NOT NULL DEFAULT 'pending',
  "invited_by" BIGINT NOT NULL,
  "accepted_account_id" BIGINT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_merchant_portal_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_merchant_sessions" (
  "id" UUID NOT NULL,
  "account_id" BIGINT NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "family_id" UUID NOT NULL,
  "parent_id" UUID,
  "user_agent" TEXT,
  "ip" INET,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_merchant_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_products" (
  "id" BIGSERIAL NOT NULL,
  "merchant_id" BIGINT NOT NULL,
  "window_id" BIGINT,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "price_cents" INTEGER,
  "image_url" TEXT,
  "status" "food_product_status" NOT NULL DEFAULT 'draft',
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "moderation_labels" JSONB,
  "content_hash" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "food_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_staff_accounts_email_key" ON "food_staff_accounts"("email");
CREATE INDEX "food_staff_accounts_status_created_at_idx" ON "food_staff_accounts"("status", "created_at" DESC);
CREATE UNIQUE INDEX "food_portal_staff_merchant_account_key" ON "food_merchant_portal_staff"("merchant_id", "account_id");
CREATE INDEX "food_merchant_portal_staff_account_id_status_idx" ON "food_merchant_portal_staff"("account_id", "status");
CREATE UNIQUE INDEX "food_merchant_portal_invitations_token_hash_key" ON "food_merchant_portal_invitations"("token_hash");
CREATE INDEX "food_merchant_portal_invitations_merchant_status_created_idx" ON "food_merchant_portal_invitations"("merchant_id", "status", "created_at" DESC);
CREATE INDEX "food_merchant_portal_invitations_email_status_idx" ON "food_merchant_portal_invitations"("email", "status");
CREATE UNIQUE INDEX "food_merchant_sessions_token_hash_key" ON "food_merchant_sessions"("token_hash");
CREATE INDEX "food_merchant_sessions_account_revoked_expires_idx" ON "food_merchant_sessions"("account_id", "revoked_at", "expires_at");
CREATE INDEX "food_merchant_sessions_family_revoked_idx" ON "food_merchant_sessions"("family_id", "revoked_at");
CREATE INDEX "food_products_merchant_status_sort_idx" ON "food_products"("merchant_id", "status", "sort_order");
CREATE INDEX "food_products_window_status_sort_idx" ON "food_products"("window_id", "status", "sort_order");
CREATE INDEX "food_posts_staff_account_created_idx" ON "food_posts"("staff_account_id", "created_at" DESC);
CREATE INDEX "food_review_replies_staff_account_created_idx" ON "food_review_replies"("staff_account_id", "created_at" DESC);
CREATE INDEX "uploads_staff_account_created_idx" ON "uploads"("staff_account_id", "created_at");

-- 将历史 food_only 账号复制为后台账号。email 作为迁移期间的稳定映射键。
INSERT INTO "food_staff_accounts" ("email", "display_name", "password_hash", "status", "created_at", "updated_at")
SELECT
  u."email",
  u."username",
  u."password_hash",
  CASE
    WHEN u."deleted_at" IS NOT NULL OR u."status" = 'banned' THEN 'disabled'::"food_staff_account_status"
    WHEN u."status" = 'suspended' THEN 'suspended'::"food_staff_account_status"
    ELSE 'active'::"food_staff_account_status"
  END,
  u."created_at",
  u."updated_at"
FROM "users" u
WHERE u."access_scope" = 'food_only'
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "food_merchant_portal_staff" ("merchant_id", "account_id", "role", "status", "joined_at", "revoked_at", "created_at")
SELECT
  legacy."merchant_id",
  account."id",
  legacy."role",
  legacy."status",
  legacy."joined_at",
  legacy."revoked_at",
  legacy."created_at"
FROM "food_merchant_staff" legacy
JOIN "users" u ON u."id" = legacy."user_id"
JOIN "food_staff_accounts" account ON account."email" = u."email"
ON CONFLICT ("merchant_id", "account_id") DO NOTHING;

INSERT INTO "food_merchant_portal_invitations" (
  "id", "merchant_id", "email", "token_hash", "role", "status", "invited_by",
  "accepted_account_id", "expires_at", "accepted_at", "revoked_at", "created_at"
)
SELECT
  legacy."id",
  legacy."merchant_id",
  legacy."email",
  legacy."token_hash",
  legacy."role",
  legacy."status",
  legacy."invited_by",
  account."id",
  legacy."expires_at",
  legacy."accepted_at",
  legacy."revoked_at",
  legacy."created_at"
FROM "food_staff_invitations" legacy
LEFT JOIN "users" accepted_user ON accepted_user."id" = legacy."accepted_by"
LEFT JOIN "food_staff_accounts" account ON account."email" = accepted_user."email"
ON CONFLICT ("id") DO NOTHING;

UPDATE "food_posts" post
SET "staff_account_id" = account."id", "author_id" = NULL
FROM "users" u
JOIN "food_staff_accounts" account ON account."email" = u."email"
WHERE post."author_id" = u."id" AND u."access_scope" = 'food_only';

UPDATE "food_review_replies" reply
SET "staff_account_id" = account."id", "author_id" = NULL
FROM "users" u
JOIN "food_staff_accounts" account ON account."email" = u."email"
WHERE reply."author_id" = u."id" AND u."access_scope" = 'food_only';

UPDATE "refresh_tokens" token
SET "revoked_at" = COALESCE(token."revoked_at", CURRENT_TIMESTAMP)
FROM "users" u
WHERE token."user_id" = u."id" AND u."access_scope" = 'food_only';

UPDATE "users"
SET "deleted_at" = COALESCE("deleted_at", CURRENT_TIMESTAMP)
WHERE "access_scope" = 'food_only';

ALTER TABLE "food_merchant_staff"
  DROP CONSTRAINT IF EXISTS "food_merchant_staff_merchant_id_fkey",
  DROP CONSTRAINT IF EXISTS "food_merchant_staff_user_id_fkey";
ALTER TABLE "food_staff_invitations"
  DROP CONSTRAINT IF EXISTS "food_staff_invitations_merchant_id_fkey",
  DROP CONSTRAINT IF EXISTS "food_staff_invitations_invited_by_fkey",
  DROP CONSTRAINT IF EXISTS "food_staff_invitations_accepted_by_fkey";
DROP TABLE "food_merchant_staff";
DROP TABLE "food_staff_invitations";

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_campus_domain_check";
ALTER TABLE "users" DROP COLUMN "access_scope";
DROP TYPE "user_access_scope";

ALTER TABLE "food_merchant_portal_staff"
  ADD CONSTRAINT "food_merchant_portal_staff_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_merchant_portal_staff_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "food_staff_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_merchant_portal_invitations"
  ADD CONSTRAINT "food_merchant_portal_invitations_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_merchant_portal_invitations_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "food_merchant_portal_invitations_accepted_account_id_fkey"
    FOREIGN KEY ("accepted_account_id") REFERENCES "food_staff_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_merchant_sessions"
  ADD CONSTRAINT "food_merchant_sessions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "food_staff_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_merchant_sessions_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "food_merchant_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_products"
  ADD CONSTRAINT "food_products_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_products_window_id_fkey"
    FOREIGN KEY ("window_id") REFERENCES "food_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_posts"
  ADD CONSTRAINT "food_posts_staff_account_id_fkey"
    FOREIGN KEY ("staff_account_id") REFERENCES "food_staff_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_review_replies"
  ADD CONSTRAINT "food_review_replies_staff_account_id_fkey"
    FOREIGN KEY ("staff_account_id") REFERENCES "food_staff_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "uploads"
  ADD CONSTRAINT "uploads_staff_account_id_fkey"
    FOREIGN KEY ("staff_account_id") REFERENCES "food_staff_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_campus_domain_check;
  ALTER TABLE users
    ADD CONSTRAINT users_email_campus_domain_check
    CHECK (deleted_at IS NOT NULL OR email ~* '^[^@]+@pop\.zjgsu\.edu\.cn$');
END $$;

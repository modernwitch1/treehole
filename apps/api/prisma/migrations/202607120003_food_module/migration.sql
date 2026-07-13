-- Food module: scoped merchant accounts, canteens, storefronts, posts and reviews.

CREATE TYPE "user_access_scope" AS ENUM ('forum_and_food', 'food_only');
CREATE TYPE "food_merchant_status" AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE "food_staff_role" AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE "food_staff_status" AS ENUM ('active', 'revoked');
CREATE TYPE "food_invitation_status" AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE "food_post_type" AS ENUM ('new_product', 'promotion', 'advertisement', 'notice');
CREATE TYPE "food_review_type" AS ENUM ('taste_review', 'suggestion');

ALTER TYPE "moderation_surface" ADD VALUE 'food_post';
ALTER TYPE "moderation_surface" ADD VALUE 'food_review';
ALTER TYPE "moderation_surface" ADD VALUE 'food_reply';

ALTER TYPE "report_target" ADD VALUE 'food_post';
ALTER TYPE "report_target" ADD VALUE 'food_review';
ALTER TYPE "report_target" ADD VALUE 'food_reply';

ALTER TABLE "users"
ADD COLUMN "access_scope" "user_access_scope" NOT NULL DEFAULT 'forum_and_food';

CREATE TABLE "food_canteens" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "food_canteens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_merchants" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "contact_display" VARCHAR(200),
    "status" "food_merchant_status" NOT NULL DEFAULT 'pending',
    "approved_by" BIGINT,
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "food_merchants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_windows" (
    "id" BIGSERIAL NOT NULL,
    "merchant_id" BIGINT NOT NULL,
    "canteen_id" BIGINT NOT NULL,
    "floor" SMALLINT NOT NULL DEFAULT 2,
    "name" VARCHAR(100) NOT NULL,
    "window_number" VARCHAR(30),
    "location_description" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "food_windows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_merchant_staff" (
    "id" BIGSERIAL NOT NULL,
    "merchant_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" "food_staff_role" NOT NULL DEFAULT 'editor',
    "status" "food_staff_status" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_merchant_staff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_staff_invitations" (
    "id" UUID NOT NULL,
    "merchant_id" BIGINT NOT NULL,
    "email" CITEXT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "role" "food_staff_role" NOT NULL DEFAULT 'editor',
    "status" "food_invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by" BIGINT NOT NULL,
    "accepted_by" BIGINT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_staff_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_posts" (
    "id" BIGSERIAL NOT NULL,
    "merchant_id" BIGINT NOT NULL,
    "window_id" BIGINT,
    "author_id" BIGINT NOT NULL,
    "type" "food_post_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content_md" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'pending_review',
    "cover_url" TEXT,
    "publish_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "moderation_labels" JSONB,
    "content_hash" VARCHAR(64),
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "food_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_reviews" (
    "id" BIGSERIAL NOT NULL,
    "window_id" BIGINT NOT NULL,
    "author_id" BIGINT NOT NULL,
    "type" "food_review_type" NOT NULL,
    "taste_score" SMALLINT,
    "content_md" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" "content_status" NOT NULL DEFAULT 'published',
    "moderation_labels" JSONB,
    "content_hash" VARCHAR(64),
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "food_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_review_replies" (
    "id" BIGSERIAL NOT NULL,
    "review_id" BIGINT NOT NULL,
    "merchant_id" BIGINT NOT NULL,
    "author_id" BIGINT NOT NULL,
    "content_md" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'pending_review',
    "moderation_labels" JSONB,
    "content_hash" VARCHAR(64),
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "food_review_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_canteens_slug_key" ON "food_canteens"("slug");
CREATE INDEX "food_canteens_is_active_name_idx" ON "food_canteens"("is_active", "name");
CREATE UNIQUE INDEX "food_merchants_slug_key" ON "food_merchants"("slug");
CREATE INDEX "food_merchants_status_updated_at_idx" ON "food_merchants"("status", "updated_at" DESC);
CREATE UNIQUE INDEX "food_windows_canteen_floor_name_key" ON "food_windows"("canteen_id", "floor", "name");
CREATE INDEX "food_windows_merchant_id_is_active_idx" ON "food_windows"("merchant_id", "is_active");
CREATE INDEX "food_windows_canteen_id_floor_is_active_idx" ON "food_windows"("canteen_id", "floor", "is_active");
CREATE UNIQUE INDEX "food_merchant_staff_merchant_user_key" ON "food_merchant_staff"("merchant_id", "user_id");
CREATE INDEX "food_merchant_staff_user_id_status_idx" ON "food_merchant_staff"("user_id", "status");
CREATE UNIQUE INDEX "food_staff_invitations_token_hash_key" ON "food_staff_invitations"("token_hash");
CREATE INDEX "food_staff_invitations_merchant_id_status_created_at_idx" ON "food_staff_invitations"("merchant_id", "status", "created_at" DESC);
CREATE INDEX "food_staff_invitations_email_status_idx" ON "food_staff_invitations"("email", "status");
CREATE INDEX "food_posts_status_publish_at_expires_at_created_at_idx" ON "food_posts"("status", "publish_at", "expires_at", "created_at" DESC);
CREATE INDEX "food_posts_merchant_id_status_created_at_idx" ON "food_posts"("merchant_id", "status", "created_at" DESC);
CREATE INDEX "food_posts_window_id_status_created_at_idx" ON "food_posts"("window_id", "status", "created_at" DESC);
CREATE INDEX "food_reviews_window_id_status_created_at_idx" ON "food_reviews"("window_id", "status", "created_at" DESC);
CREATE INDEX "food_reviews_author_id_created_at_idx" ON "food_reviews"("author_id", "created_at" DESC);
CREATE INDEX "food_review_replies_review_id_status_created_at_idx" ON "food_review_replies"("review_id", "status", "created_at");
CREATE INDEX "food_review_replies_merchant_id_status_created_at_idx" ON "food_review_replies"("merchant_id", "status", "created_at" DESC);

ALTER TABLE "food_windows"
  ADD CONSTRAINT "food_windows_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_windows_canteen_id_fkey" FOREIGN KEY ("canteen_id") REFERENCES "food_canteens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_merchant_staff"
  ADD CONSTRAINT "food_merchant_staff_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_merchant_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_staff_invitations"
  ADD CONSTRAINT "food_staff_invitations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_staff_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "food_staff_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_posts"
  ADD CONSTRAINT "food_posts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "food_posts_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "food_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "food_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_reviews"
  ADD CONSTRAINT "food_reviews_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "food_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_review_replies"
  ADD CONSTRAINT "food_review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "food_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "food_review_replies_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "food_merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "food_review_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

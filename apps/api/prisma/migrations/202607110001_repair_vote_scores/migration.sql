-- Repair historical vote counters and initialize hot ranking values.
-- Older application code granted each new post an implicit author upvote
-- without recording it in votes, and never maintained score/hot_score.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_posts_published_title_trgm"
  ON "posts" USING GIN ("title" gin_trgm_ops)
  WHERE "status" = 'published';

CREATE INDEX IF NOT EXISTS "idx_posts_published_content_trgm"
  ON "posts" USING GIN ("content_md" gin_trgm_ops)
  WHERE "status" = 'published';

INSERT INTO "votes" (
  "user_id",
  "target_type",
  "target_id",
  "value",
  "created_at",
  "updated_at"
)
SELECT
  p."author_id",
  'post'::"vote_target",
  p."id",
  1,
  p."created_at",
  CURRENT_TIMESTAMP
FROM "posts" p
WHERE p."upvotes" > 0
ON CONFLICT ("user_id", "target_type", "target_id") DO NOTHING;

WITH vote_totals AS (
  SELECT
    "target_id",
    COUNT(*) FILTER (WHERE "value" = 1)::INTEGER AS upvotes,
    COUNT(*) FILTER (WHERE "value" = -1)::INTEGER AS downvotes
  FROM "votes"
  WHERE "target_type" = 'post'
  GROUP BY "target_id"
)
UPDATE "posts" p
SET
  "upvotes" = COALESCE(v.upvotes, 0),
  "downvotes" = COALESCE(v.downvotes, 0),
  "score" = COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0),
  "hot_score" =
    SIGN(COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0))
    * LN(GREATEST(ABS(COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0)), 1))
    + EXTRACT(EPOCH FROM p."created_at") / 45000.0
FROM vote_totals v
WHERE p."id" = v."target_id";

UPDATE "posts" p
SET
  "upvotes" = 0,
  "downvotes" = 0,
  "score" = 0,
  "hot_score" = EXTRACT(EPOCH FROM p."created_at") / 45000.0
WHERE NOT EXISTS (
  SELECT 1
  FROM "votes" v
  WHERE v."target_type" = 'post' AND v."target_id" = p."id"
);

WITH vote_totals AS (
  SELECT
    "target_id",
    COUNT(*) FILTER (WHERE "value" = 1)::INTEGER AS upvotes,
    COUNT(*) FILTER (WHERE "value" = -1)::INTEGER AS downvotes
  FROM "votes"
  WHERE "target_type" = 'comment'
  GROUP BY "target_id"
)
UPDATE "comments" c
SET
  "upvotes" = COALESCE(v.upvotes, 0),
  "downvotes" = COALESCE(v.downvotes, 0),
  "score" = COALESCE(v.upvotes, 0) - COALESCE(v.downvotes, 0)
FROM vote_totals v
WHERE c."id" = v."target_id";

UPDATE "comments" c
SET "upvotes" = 0, "downvotes" = 0, "score" = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM "votes" v
  WHERE v."target_type" = 'comment' AND v."target_id" = c."id"
);

-- 浙工商校园论坛 — Prisma 无法表达的 Postgres 原生特性
-- 在每次 `prisma db push / migrate deploy` 之后执行：
--   pnpm prisma db execute --file prisma/sql/post-migrate.sql --schema prisma/schema.prisma
--
-- 这些语句全部是幂等的（IF NOT EXISTS / DROP+CREATE 的安全形式），可重复执行。

-- ============================================================
-- 1. 扩展确保启用（Prisma extensions 已写入 schema, 这里再兜底）
-- ============================================================
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 2. users.email 必须是校园邮箱
--    域名通过应用层 + 数据库 CHECK 双重保险
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_campus_domain_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_campus_domain_check
      CHECK (email ~* '^[^@]+@pop\.zjgsu\.edu\.cn$');
  END IF;
END $$;

-- ============================================================
-- 3. comments.path GIST 索引（ltree 子树查询）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_comments_path_gist
  ON comments USING GIST (path);

-- ============================================================
-- 4. votes 投票值合法性约束
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_value_check'
  ) THEN
    ALTER TABLE votes
      ADD CONSTRAINT votes_value_check CHECK (value IN (-1, 1));
  END IF;
END $$;

-- ============================================================
-- 5. comments.depth 上限（≤ 3，应用层主校验，DB 兜底）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_depth_check'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_depth_check CHECK (depth >= 0 AND depth <= 3);
  END IF;
END $$;

-- ============================================================
-- 6. notifications 唯一约束：同一里程碑只发一次
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_milestone
  ON notifications (recipient_id, type, post_id, ((payload->>'milestone')::int))
  WHERE type = 'vote_milestone';

-- ============================================================
-- 7. 帖子关键词搜索（ILIKE/contains）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_published_title_trgm
  ON posts USING GIN (title gin_trgm_ops)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_posts_published_content_trgm
  ON posts USING GIN (content_md gin_trgm_ops)
  WHERE status = 'published';

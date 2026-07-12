ALTER TABLE "posts" ADD COLUMN "quoted_post_id" BIGINT;

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_quoted_post_id_fkey"
  FOREIGN KEY ("quoted_post_id") REFERENCES "posts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_posts_quoted_post" ON "posts"("quoted_post_id");

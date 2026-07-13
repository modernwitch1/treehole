-- 允许论坛超级管理员使用独立商家后台会话管理所有已启用商家。
-- 账号仍保存在 food_staff_accounts，避免复用论坛 Cookie 或论坛权限范围。

ALTER TABLE "food_staff_accounts"
  ADD COLUMN "user_id" BIGINT,
  ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "food_staff_accounts_user_id_key"
  ON "food_staff_accounts"("user_id");

ALTER TABLE "food_staff_accounts"
  ADD CONSTRAINT "food_staff_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

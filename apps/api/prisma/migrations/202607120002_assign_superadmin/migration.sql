-- Assign the installation owner only when no superadmin exists yet. This is
-- intentionally a no-op when ownership has already been established or the
-- target account has not been created.
UPDATE "users"
SET "role" = 'superadmin'::"user_role",
    "updated_at" = CURRENT_TIMESTAMP
WHERE "username" = 'hezhong233'
  AND NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE "role" = 'superadmin'::"user_role"
  );

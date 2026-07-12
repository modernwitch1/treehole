-- Add the owner-only role. The partial unique index enforces at the database
-- layer that the installation can never contain more than one superadmin.
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'superadmin';

-- PostgreSQL requires a newly-added enum label to be committed before it can
-- appear in an index predicate. Prisma executes this idempotent migration as a
-- single query batch, so terminate that implicit transaction before indexing.
COMMIT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_single_superadmin_idx"
  ON "users" ("role")
  WHERE "role" = 'superadmin'::"user_role";

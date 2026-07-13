-- Merchant staff accounts are created only through admin invitations and may
-- use a non-campus mailbox. Ordinary forum accounts remain campus-only.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_campus_domain_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_campus_domain_check"
  CHECK ("access_scope" = 'food_only' OR "email" ~* '^[^@]+@pop\.zjgsu\.edu\.cn$');

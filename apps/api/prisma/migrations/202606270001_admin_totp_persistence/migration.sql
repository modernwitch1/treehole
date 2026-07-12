ALTER TABLE "users"
  ADD COLUMN "admin_totp_secret_ciphertext" TEXT,
  ADD COLUMN "admin_totp_enabled_at" TIMESTAMPTZ;

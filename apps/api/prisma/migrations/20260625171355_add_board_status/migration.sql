-- CreateEnum
CREATE TYPE "board_status" AS ENUM ('pending', 'active', 'rejected', 'archived');

-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "applicant_id" BIGINT,
ADD COLUMN     "applied_at" TIMESTAMPTZ,
ADD COLUMN     "apply_reason" TEXT,
ADD COLUMN     "color" VARCHAR(20),
ADD COLUMN     "icon" VARCHAR(50),
ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ,
ADD COLUMN     "reviewed_by" BIGINT,
ADD COLUMN     "status" "board_status" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "boards_status_sort_order_idx" ON "boards"("status", "sort_order");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_products"
ADD COLUMN "category" VARCHAR(50);

CREATE INDEX "food_products_merchant_category_status_idx"
ON "food_products"("merchant_id", "category", "status");

-- Split checkout/Meta wall-clock time from database insert time.
-- Historical rows: created_at is backfilled from order_event_at (true insert time was not recorded).

ALTER TABLE "orders" RENAME COLUMN "created_at" TO "order_event_at";
--> statement-breakpoint

ALTER INDEX "orders_created_idx" RENAME TO "orders_order_event_at_idx";
--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "created_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint

UPDATE "orders" SET "created_at" = "order_event_at";
--> statement-breakpoint

ALTER TABLE "orders" ALTER COLUMN "created_at" SET DEFAULT NOW();
--> statement-breakpoint

ALTER TABLE "orders" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at" DESC);

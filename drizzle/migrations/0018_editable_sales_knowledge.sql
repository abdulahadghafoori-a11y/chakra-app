-- Editable business KB + extended product fields for the sales agent (no hardcoded copy in app).
CREATE TABLE IF NOT EXISTS "business_knowledge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "business_knowledge_slug_unique" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "business_knowledge_slug_idx" ON "business_knowledge" ("slug");
CREATE INDEX IF NOT EXISTS "business_knowledge_sort_idx" ON "business_knowledge" ("sort_order");

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "specs_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "faq_json" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "knowledge_notes" text;

-- Seed default topics (edit in DB or /sales/knowledge); idempotent by slug.
INSERT INTO "business_knowledge" ("slug", "title", "body", "sort_order")
VALUES
  (
    'payment',
    'پرداخت',
    'پرداخت هنگام تحویل: مشتری می‌تواند هنگام دریافت سفارش در محل، وجه را بپردازد. این روش برای اطمینان از خرید در نظر گرفته شده است.',
    10
  ),
  (
    'shipping',
    'ارسال',
    'ارسال رایگان به تمام ولایات افغانستان. سفارش به سراسر کشور ارسال می‌شود. زمان دقیق تحویل به ولایت و شرایط راه بستگی دارد؛ برای تاریخ تقریبی همان سفارش همکار انسانی را بپرسید.',
    20
  ),
  (
    'warranty',
    'ضمانت',
    'بیشتر محصولات دارای یک سال ضمانت هستند. جزئیات ضمانت برای کالای مشخص را فقط اگر در کاتالوگ (ابزار get_product) آمده بگویید؛ در غیر این صورت سیاست کلی را بگویید و برای جزئیات دقیق همان کالا به همکار ارجاع دهید.',
    30
  ),
  (
    'returns',
    'مرجوعی',
    'شرایط مرجوعی و تعویض را فقط مطابق سیاست رسمی فروشگاه که از همکار تأیید شده بگویید. اگر در این متن جزئیات ندارید، بگویید همکار انسانی قوانین مرجوعی را دقیق توضیح می‌دهد.',
    40
  ),
  (
    'general',
    'عمومی',
    'فروشگاه آنلاین در افغانستان است؛ هدف خدمت سریع، قابل اعتماد و آسان به مردم افغانستان. برای پرداخت، ارسال و ضمانت از ابزار get_store_policy با موضوع مشخص استفاده کنید.',
    50
  )
ON CONFLICT ("slug") DO NOTHING;

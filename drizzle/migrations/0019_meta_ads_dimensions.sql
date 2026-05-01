CREATE TABLE "meta_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"objective" text,
	"status" text,
	"effective_status" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text,
	"status" text,
	"effective_status" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"meta_ad_set_id" text NOT NULL,
	"meta_campaign_id" text NOT NULL,
	"name" text,
	"status" text,
	"effective_status" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_insights_daily" (
	"insight_date" date NOT NULL,
	"meta_ad_id" text NOT NULL,
	"meta_ad_set_id" text,
	"meta_campaign_id" text,
	"spend" numeric(16, 4) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_meta_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("meta_campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_meta_ad_set_id_meta_ad_sets_id_fk" FOREIGN KEY ("meta_ad_set_id") REFERENCES "public"."meta_ad_sets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_meta_campaign_id_meta_campaigns_id_fk" FOREIGN KEY ("meta_campaign_id") REFERENCES "public"."meta_campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_meta_ad_id_meta_ads_id_fk" FOREIGN KEY ("meta_ad_id") REFERENCES "public"."meta_ads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_insight_date_meta_ad_id_pk" PRIMARY KEY("insight_date","meta_ad_id");
--> statement-breakpoint
CREATE INDEX "meta_ad_sets_meta_campaign_id_idx" ON "meta_ad_sets" USING btree ("meta_campaign_id");
--> statement-breakpoint
CREATE INDEX "meta_ads_meta_ad_set_id_idx" ON "meta_ads" USING btree ("meta_ad_set_id");
--> statement-breakpoint
CREATE INDEX "meta_ads_meta_campaign_id_idx" ON "meta_ads" USING btree ("meta_campaign_id");
--> statement-breakpoint
CREATE INDEX "ad_insights_daily_meta_campaign_id_idx" ON "ad_insights_daily" USING btree ("meta_campaign_id");
--> statement-breakpoint
CREATE INDEX "ad_insights_daily_insight_date_idx" ON "ad_insights_daily" USING btree ("insight_date");
--> statement-breakpoint
ALTER TABLE "ctwa_sessions" ADD COLUMN "meta_ad_id" text;
--> statement-breakpoint
ALTER TABLE "ctwa_sessions" ADD CONSTRAINT "ctwa_sessions_meta_ad_id_meta_ads_id_fk" FOREIGN KEY ("meta_ad_id") REFERENCES "public"."meta_ads"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ctwa_sessions_meta_ad_id_idx" ON "ctwa_sessions" USING btree ("meta_ad_id");

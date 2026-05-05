CREATE TABLE "meta_engagement_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"external_comment_id" text NOT NULL,
	"parent_external_comment_id" text,
	"parent_post_id" text NOT NULL,
	"container_id" text NOT NULL,
	"author_external_id" text,
	"author_name" text,
	"message_text" text,
	"permalink_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_engagement_comments_platform_check" CHECK ("platform" IN ('facebook','instagram')),
	CONSTRAINT "meta_engagement_comments_status_check" CHECK ("status" IN ('active','hidden','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meta_engagement_comments_platform_external_unique" ON "meta_engagement_comments" ("platform","external_comment_id");
--> statement-breakpoint
CREATE INDEX "meta_engagement_comments_created_idx" ON "meta_engagement_comments" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX "meta_engagement_comments_status_idx" ON "meta_engagement_comments" ("status");
--> statement-breakpoint
CREATE TABLE "meta_engagement_comment_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_engagement_comment_actions" ADD CONSTRAINT "meta_engagement_comment_actions_comment_id_meta_engagement_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."meta_engagement_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "meta_engagement_comment_actions_comment_id_idx" ON "meta_engagement_comment_actions" ("comment_id");
--> statement-breakpoint
CREATE TABLE "meta_dm_bridge_threads" (
	"channel" text NOT NULL,
	"scope_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"reply_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_dm_bridge_threads_channel_check" CHECK ("channel" IN ('messenger','instagram_dm')),
	CONSTRAINT "meta_dm_bridge_threads_pkey" PRIMARY KEY("channel","scope_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "meta_dm_bridge_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"scope_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"direction" text NOT NULL,
	"body" text,
	"model" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_dm_bridge_logs_direction_check" CHECK ("direction" IN ('inbound','outbound'))
);
--> statement-breakpoint
CREATE INDEX "meta_dm_bridge_logs_created_idx" ON "meta_dm_bridge_logs" ("created_at" DESC);

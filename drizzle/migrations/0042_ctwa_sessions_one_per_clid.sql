-- One CTWA session per contact + click id (duplicate webhooks / relay + Meta direct).
UPDATE "orders" o
SET "ctwa_session_id" = sub."keep_id"
FROM (
  SELECT
    dup."id" AS "dup_id",
    (
      SELECT s."id"
      FROM "ctwa_sessions" s
      WHERE s."contact_id" = dup."contact_id"
        AND s."ctwa_clid" = dup."ctwa_clid"
      ORDER BY
        (SELECT COUNT(*)::int FROM "orders" o2 WHERE o2."ctwa_session_id" = s."id") DESC,
        s."send_time" ASC,
        s."id" ASC
      LIMIT 1
    ) AS "keep_id"
  FROM "ctwa_sessions" dup
) sub
WHERE o."ctwa_session_id" = sub."dup_id"
  AND sub."keep_id" IS NOT NULL
  AND sub."dup_id" <> sub."keep_id";
--> statement-breakpoint
DELETE FROM "ctwa_sessions" dup
WHERE dup."id" <> (
  SELECT s."id"
  FROM "ctwa_sessions" s
  WHERE s."contact_id" = dup."contact_id"
    AND s."ctwa_clid" = dup."ctwa_clid"
  ORDER BY
    (SELECT COUNT(*)::int FROM "orders" o WHERE o."ctwa_session_id" = s."id") DESC,
    s."send_time" ASC,
    s."id" ASC
  LIMIT 1
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ctwa_sessions_contact_ctwa_send_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ctwa_sessions_contact_ctwa_clid_unique" ON "ctwa_sessions" ("contact_id", "ctwa_clid");

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { productVersions, profiles } from "./app";

// A version-level compare-and-swap fence makes canonical writes and all of that
// formula's category aggregates one atomic D1 batch, including Tried changes.
export const formulaRevisions = sqliteTable("formula_revisions", {
  productVersionId: text("product_version_id")
    .primaryKey()
    .references(() => productVersions.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
  writeToken: text("write_token"),
});

export const mediaUploads = sqliteTable(
  "media_uploads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    productVersionId: text("product_version_id")
      .notNull()
      .references(() => productVersions.id, { onDelete: "restrict" }),
    slot: text("slot").notNull(),
    contentHash: text("content_hash").notNull(),
    state: text("state", {
      enum: ["pending", "processing", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    activeAttemptId: text("active_attempt_id"),
    imageId: text("image_id"),
    failureCode: text("failure_code"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_media_upload_idempotency").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("ix_media_upload_state_updated").on(table.state, table.updatedAt),
    check(
      "ck_media_upload_slot",
      sql`${table.slot} IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')`,
    ),
    check(
      "ck_media_upload_state",
      sql`${table.state} IN ('pending', 'processing', 'complete', 'failed')`,
    ),
  ],
);

export const mediaAttempts = sqliteTable(
  "media_attempts",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => mediaUploads.id, { onDelete: "restrict" }),
    state: text("state", {
      enum: ["processing", "committed", "abandoned"],
    }).notNull(),
    leaseExpiresAt: integer("lease_expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ix_media_attempt_recovery").on(table.state, table.leaseExpiresAt),
    index("ix_media_attempt_created").on(table.createdAt),
    index("ix_media_attempt_upload").on(table.uploadId),
    check(
      "ck_media_attempt_state",
      sql`${table.state} IN ('processing', 'committed', 'abandoned')`,
    ),
  ],
);

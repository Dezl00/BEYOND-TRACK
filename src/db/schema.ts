import {
  pgTable,
  uuid,
  text,
  varchar,
  smallint,
  boolean,
  timestamp,
  numeric,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  bigserial,
  bigint,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) =>
  timestamp(name, { withTimezone: true }).defaultNow().notNull();
export const roles = pgTable(
  "roles",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    system: boolean("system").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("roles_name").on(t.name)],
);
export const permissions = pgTable(
  "permissions",
  {
    id: id(),
    key: varchar("key", { length: 80 }).notNull(),
    label: varchar("label", { length: 150 }).notNull(),
  },
  (t) => [uniqueIndex("permission_key").on(t.key)],
);
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);
export const users = pgTable(
  "users",
  {
    id: id(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    username: varchar("username", { length: 80 }).notNull(),
    jobTitle: varchar("job_title", { length: 150 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    isOwner: boolean("is_owner").default(false).notNull(),
    locked: boolean("locked").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    failedAttempts: smallint("failed_attempts").default(0).notNull(),
    otpEnabled: boolean("otp_enabled").default(false).notNull(),
    otpExempt: boolean("otp_exempt").default(false).notNull(),
    forcePasswordChange: boolean("force_password_change")
      .default(true)
      .notNull(),
    theme: smallint("theme").default(0).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("users_email").on(t.email),
    uniqueIndex("users_username").on(t.username),
    index("users_role").on(t.roleId),
  ],
);
export const projects = pgTable(
  "projects",
  {
    id: id(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    location: varchar("location", { length: 200 }).default("").notNull(),
    archived: boolean("archived").default(false).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [uniqueIndex("projects_code").on(t.code)],
);
export const projectUsers = pgTable(
  "project_users",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_users_user").on(t.userId),
  ],
);
export const units = pgTable(
  "units",
  {
    id: id(),
    name: varchar("name", { length: 50 }).notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("units_name").on(t.name)],
);
export const boqItems = pgTable(
  "boq_items",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    parentId: uuid("parent_id"),
    level: smallint("level").notNull(),
    code: varchar("code", { length: 60 }).notNull(),
    name: varchar("name", { length: 250 }).notNull(),
    active: boolean("active").default(true).notNull(),
    description: text("description"),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("boq_project_code").on(t.projectId, t.code),
    index("boq_parent").on(t.parentId),
    index("boq_unit").on(t.unitId),
  ],
);
export const materials = pgTable(
  "materials",
  {
    id: id(),
    boqItemId: uuid("boq_item_id")
      .notNull()
      .references(() => boqItems.id),
    name: varchar("name", { length: 200 }).notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("materials_item_name").on(t.boqItemId, t.name)],
);
export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    name: varchar("name", { length: 200 }).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("suppliers_name").on(t.name)],
);
export const requests = pgTable(
  "purchase_requests",
  {
    id: id(),
    number: bigserial("number", { mode: "number" }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    status: smallint("status").default(0).notNull(),
    notes: text("notes").default("").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    expectedAt: varchar("expected_at", { length: 10 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    pricingRevision: integer("pricing_revision").default(0).notNull(),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    uniqueIndex("requests_number").on(t.number),
    index("requests_project_cursor").on(t.projectId, t.createdAt, t.id),
    index("requests_creator_cursor").on(t.createdBy, t.createdAt, t.id),
    index("requests_status_delivery").on(t.status, t.expectedAt),
    index("requests_supplier").on(t.supplierId),
  ],
);
export const requestLines = pgTable(
  "request_lines",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    price: numeric("price", { precision: 18, scale: 2 }),
    notes: varchar("notes", { length: 1000 }).default("").notNull(),
    overageApprovedBy: uuid("overage_approved_by").references(() => users.id),
    overageApprovedAt: timestamp("overage_approved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("request_material").on(t.requestId, t.materialId),
    index("lines_material").on(t.materialId),
  ],
);
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    key: uuid("idempotency_key").notNull(),
    notes: varchar("notes", { length: 1000 }).default("").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    index("receipts_request").on(t.requestId),
    uniqueIndex("receipt_key").on(t.key),
  ],
);
export const requestQuotes = pgTable(
  "request_quotes",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    expectedAt: varchar("expected_at", { length: 10 }).notNull(),
    prices: jsonb("prices").notNull(),
    selected: boolean("selected").default(false).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("quote_supplier_revision").on(
      t.requestId,
      t.revision,
      t.supplierId,
    ),
  ],
);
export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: id(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id),
    requestLineId: uuid("request_line_id")
      .notNull()
      .references(() => requestLines.id),
    accepted: numeric("accepted", { precision: 18, scale: 3 }).notNull(),
    damaged: numeric("damaged", { precision: 18, scale: 3 }).notNull(),
    rejected: numeric("rejected", { precision: 18, scale: 3 }).notNull(),
    returned: numeric("returned", { precision: 18, scale: 3 }).notNull(),
  },
  (t) => [
    index("receipt_lines_request").on(t.requestLineId),
    uniqueIndex("receipt_lines_unique").on(t.receiptId, t.requestLineId),
  ],
);
export const timeline = pgTable(
  "request_timeline",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    fromStatus: smallint("from_status"),
    toStatus: smallint("to_status").notNull(),
    note: varchar("note", { length: 1000 }).default("").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("timeline_request_cursor").on(t.requestId, t.createdAt, t.id)],
);
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id),
    receiptId: uuid("receipt_id").references(() => receipts.id),
    receiptKey: uuid("receipt_key"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    publicId: text("public_id").notNull(),
    resourceType: varchar("resource_type", { length: 10 }).notNull(),
    format: varchar("format", { length: 10 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    index("attachments_request").on(t.requestId),
    index("attachments_receipt").on(t.receiptId),
  ],
);
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    previousTokenHash: varchar("previous_token_hash", { length: 64 }),
    previousUntil: timestamp("previous_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    remember: boolean("remember").default(false).notNull(),
    ip: varchar("ip", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }).notNull(),
    createdAt: time("created_at"),
    rotatedAt: time("rotated_at"),
  },
  (t) => [
    uniqueIndex("sessions_hash").on(t.tokenHash),
    index("sessions_previous_hash").on(t.previousTokenHash),
    index("sessions_user").on(t.userId),
    index("sessions_expiry").on(t.expiresAt),
  ],
);
export const challenges = pgTable(
  "auth_challenges",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: smallint("kind").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    remember: boolean("remember").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    index("challenges_user").on(t.userId),
    uniqueIndex("challenges_token").on(t.tokenHash),
    index("challenges_expiry").on(t.expiresAt),
  ],
);
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 100 }).primaryKey(),
    count: integer("count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limit_expiry").on(t.expiresAt)],
);
export const settings = pgTable("settings", {
  id: smallint("id").primaryKey().default(1),
  otpRequired: boolean("otp_required").default(false).notNull(),
  defaultTheme: smallint("default_theme").default(0).notNull(),
  digits: smallint("digits").default(0).notNull(),
  readNotificationDays: integer("read_notification_days").default(30).notNull(),
});
export const notificationPolicy = pgTable("notification_policy", {
  type: smallint("type").primaryKey(),
  inApp: boolean("in_app").default(true).notNull(),
  email: boolean("email").default(true).notNull(),
  forced: boolean("forced").default(false).notNull(),
});
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: smallint("type").notNull(),
    inApp: boolean("in_app").notNull(),
    email: boolean("email").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eventId: uuid("event_id").notNull(),
    type: smallint("type").notNull(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    index("notifications_user_cursor").on(t.userId, t.createdAt, t.id),
    uniqueIndex("notification_dedup").on(t.userId, t.eventId),
  ],
);
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    kind: smallint("kind").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    availableAt: time("available_at"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [index("outbox_ready").on(t.availableAt)],
);
export const requestPurgeChallenges = pgTable(
  "request_purge_challenges",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("purge_challenge_user").on(t.userId),
    index("purge_challenge_session").on(t.sessionId),
  ],
);
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: varchar("p256dh", { length: 150 }).notNull(),
    auth: varchar("auth", { length: 100 }).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("push_subscriptions_user").on(t.userId)],
);
// audit_log is created by the custom migration, partitioned by month with an immutable trigger.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").notNull(),
    actorId: uuid("actor_id"),
    projectId: uuid("project_id"),
    action: smallint("action").notNull(),
    entity: smallint("entity").notNull(),
    entityId: varchar("entity_id", { length: 80 }),
    ip: varchar("ip", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }).notNull(),
    diff: jsonb("diff").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.createdAt, t.id] }),
    index("audit_actor_time").on(t.actorId, t.createdAt),
    index("audit_project_time").on(t.projectId, t.createdAt),
  ],
);

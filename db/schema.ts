import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Money is stored as integer kobo (1 NGN = 100 kobo). Never use floats. */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)]
);

export const stores = pgTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    description: text("description").default("").notNull(),
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    phone: varchar("phone", { length: 32 }),
    whatsapp: varchar("whatsapp", { length: 32 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    instagramUrl: text("instagram_url"),
    facebookUrl: text("facebook_url"),
    twitterUrl: text("twitter_url"),
    tiktokUrl: text("tiktok_url"),
    currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("stores_slug_uidx").on(t.slug),
    index("stores_owner_idx").on(t.ownerId),
  ]
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description").default("").notNull(),
    /** Price in kobo */
    priceKobo: integer("price_kobo").notNull(),
    imageUrl: text("image_url"),
    stock: integer("stock").default(0).notNull(),
    category: varchar("category", { length: 80 }).default("General").notNull(),
    active: boolean("active").default(true).notNull(),
    featured: boolean("featured").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("products_store_idx").on(t.storeId),
    uniqueIndex("products_store_slug_uidx").on(t.storeId, t.slug),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
    customerEmail: varchar("customer_email", { length: 255 }).notNull(),
    deliveryAddress: text("delivery_address").notNull(),
    note: text("note").default("").notNull(),
    /** Subtotal and total in kobo */
    subtotalKobo: integer("subtotal_kobo").notNull(),
    /** Discount applied at checkout (kobo snapshot) */
    discountKobo: integer("discount_kobo").default(0).notNull(),
    /** Coupon code snapshot (uppercase); null if none */
    couponCode: varchar("coupon_code", { length: 40 }),
    totalKobo: integer("total_kobo").notNull(),
    currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
    paymentStatus: varchar("payment_status", { length: 20 }).default("pending").notNull(),
    orderStatus: varchar("order_status", { length: 20 }).default("pending").notNull(),
    paymentReference: varchar("payment_reference", { length: 120 }),
    paystackAccessCode: varchar("paystack_access_code", { length: 120 }),
    /** True while pending checkout holds inventory until payment or expiry */
    stockReserved: boolean("stock_reserved").default(false).notNull(),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("orders_store_idx").on(t.storeId),
    uniqueIndex("orders_payment_ref_uidx").on(t.paymentReference),
    index("orders_reservation_expiry_idx").on(t.reservationExpiresAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productNameSnapshot: varchar("product_name_snapshot", { length: 160 }).notNull(),
    unitPriceKoboSnapshot: integer("unit_price_kobo_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalKobo: integer("line_total_kobo").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)]
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    reference: varchar("reference", { length: 120 }).notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    provider: varchar("provider", { length: 32 }).default("paystack").notNull(),
    rawEventId: varchar("raw_event_id", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("payments_reference_uidx").on(t.reference),
    // Postgres allows multiple NULLs in a unique index — only non-null event ids must be unique
    uniqueIndex("payments_raw_event_id_uidx").on(t.rawEventId),
    index("payments_order_idx").on(t.orderId),
  ]
);


export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    index("product_images_product_sort_idx").on(t.productId, t.sortOrder),
  ]
);

export type User = typeof users.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

/** Discount coupons scoped to a store. Codes are stored uppercase. */
export const coupons = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 40 }).notNull(),
    /** percentage | fixed */
    type: varchar("type", { length: 20 }).notNull(),
    /**
     * percentage: whole percent 1–100
     * fixed: discount in kobo
     */
    value: integer("value").notNull(),
    /** Minimum eligible subtotal in kobo; 0 = none */
    minimumOrderAmount: integer("minimum_order_amount").default(0).notNull(),
    /** Cap for percentage discounts in kobo; null = no cap */
    maximumDiscountAmount: integer("maximum_discount_amount"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** null = unlimited */
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").default(0).notNull(),
    /** null = unlimited per customer email */
    perCustomerLimit: integer("per_customer_limit"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("coupons_store_code_uidx").on(t.storeId, t.code),
    index("coupons_store_idx").on(t.storeId),
  ]
);

export const couponProducts = pgTable(
  "coupon_products",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("coupon_products_uidx").on(t.couponId, t.productId),
    index("coupon_products_coupon_idx").on(t.couponId),
    index("coupon_products_product_idx").on(t.productId),
  ]
);

/** Lightweight storefront conversion events (anonymous-safe). */
export const storeEvents = pgTable(
  "store_events",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    visitorId: varchar("visitor_id", { length: 64 }),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("store_events_store_idx").on(t.storeId),
    index("store_events_type_idx").on(t.eventType),
    index("store_events_created_idx").on(t.createdAt),
    index("store_events_product_idx").on(t.productId),
  ]
);

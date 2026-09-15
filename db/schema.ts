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
    /** Seller-controlled SEO / social preview (optional) */
    seoTitle: varchar("seo_title", { length: 70 }),
    seoDescription: varchar("seo_description", { length: 160 }),
    seoKeywords: varchar("seo_keywords", { length: 255 }),
    ogTitle: varchar("og_title", { length: 70 }),
    ogDescription: varchar("og_description", { length: 160 }),
    ogImageUrl: text("og_image_url"),
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
    /** Seller-only internal note (never shown on public storefront) */
    sellerNote: text("seller_note").default("").notNull(),
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

/** In-dashboard seller notifications (private to store owner). */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    message: text("message").notNull(),
    relatedOrderId: integer("related_order_id"),
    relatedProductId: integer("related_product_id"),
    relatedCouponId: integer("related_coupon_id"),
    href: varchar("href", { length: 255 }),
    read: boolean("read").default(false).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_store_idx").on(t.storeId),
    index("notifications_store_unread_idx").on(t.storeId, t.read),
    index("notifications_created_idx").on(t.createdAt),
    uniqueIndex("notifications_dedupe_uidx").on(t.storeId, t.dedupeKey),
  ]
);


export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description").default("").notNull(),
    campaignType: varchar("campaign_type", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    bannerUrl: text("banner_url"),
    announcementText: text("announcement_text"),
    couponId: integer("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("campaigns_store_slug_uidx").on(t.storeId, t.slug),
    index("campaigns_store_idx").on(t.storeId),
    index("campaigns_store_status_idx").on(t.storeId, t.status),
    index("campaigns_starts_idx").on(t.startsAt),
    index("campaigns_ends_idx").on(t.endsAt),
  ]
);

export const campaignProducts = pgTable(
  "campaign_products",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("campaign_products_uidx").on(t.campaignId, t.productId),
    index("campaign_products_campaign_idx").on(t.campaignId),
    index("campaign_products_product_idx").on(t.productId),
  ]
);


/** Configurable seller subscription plans (prices in kobo). */
export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 40 }).notNull(),
    description: text("description").default("").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    billingInterval: varchar("billing_interval", { length: 20 }).notNull().default("monthly"),
    productLimit: integer("product_limit"),
    featuresJson: text("features_json").default("{}").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("subscription_plans_slug_uidx").on(t.slug),
    index("subscription_plans_active_idx").on(t.active),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    provider: varchar("provider", { length: 40 }).default("paystack").notNull(),
    providerSubscriptionCode: varchar("provider_subscription_code", { length: 120 }),
    providerCustomerCode: varchar("provider_customer_code", { length: 120 }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscriptions_store_idx").on(t.storeId),
    index("subscriptions_status_idx").on(t.status),
    uniqueIndex("subscriptions_store_uidx").on(t.storeId),
  ]
);

export const billingTransactions = pgTable(
  "billing_transactions",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 40 }).default("paystack").notNull(),
    reference: varchar("reference", { length: 120 }).notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    transactionType: varchar("transaction_type", { length: 40 }).notNull(),
    planId: integer("plan_id").references(() => subscriptionPlans.id, { onDelete: "set null" }),
    rawEventId: varchar("raw_event_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("billing_transactions_reference_uidx").on(t.reference),
    uniqueIndex("billing_transactions_raw_event_uidx").on(t.rawEventId),
    index("billing_transactions_store_idx").on(t.storeId),
    index("billing_transactions_subscription_idx").on(t.subscriptionId),
  ]
);

export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 160 }),
    metadata: text("metadata"),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscription_events_sub_idx").on(t.subscriptionId),
    uniqueIndex("subscription_events_provider_uidx").on(t.providerEventId),
  ]
);

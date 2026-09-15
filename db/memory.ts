/** In-memory store shape for tests / local demo (no Postgres driver). */

export type MemoryStore = {
  users: Array<{
    id: number;
    email: string;
    passwordHash: string;
    fullName: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  stores: Array<{
    id: number;
    ownerId: number;
    name: string;
    slug: string;
    description: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    instagramUrl: string | null;
    facebookUrl: string | null;
    twitterUrl: string | null;
    tiktokUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoKeywords: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  products: Array<{
    id: number;
    storeId: number;
    name: string;
    slug: string;
    description: string;
    priceKobo: number;
    imageUrl: string | null;
    stock: number;
    category: string;
    active: boolean;
    featured: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  productImages: Array<{
    id: number;
    productId: number;
    imageUrl: string;
    sortOrder: number;
    createdAt: Date;
  }>;
  orders: Array<{
    id: number;
    storeId: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    deliveryAddress: string;
    note: string;
    sellerNote: string;
    subtotalKobo: number;
    discountKobo: number;
    couponCode: string | null;
    totalKobo: number;
    currency: string;
    paymentStatus: string;
    orderStatus: string;
    paymentReference: string | null;
    paystackAccessCode: string | null;
    stockReserved: boolean;
    reservationExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  orderItems: Array<{
    id: number;
    orderId: number;
    productId: number | null;
    productNameSnapshot: string;
    unitPriceKoboSnapshot: number;
    quantity: number;
    lineTotalKobo: number;
  }>;
  payments: Array<{
    id: number;
    orderId: number;
    reference: string;
    amountKobo: number;
    currency: string;
    status: string;
    provider: string;
    rawEventId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  coupons: Array<{
    id: number;
    storeId: number;
    code: string;
    type: string;
    value: number;
    minimumOrderAmount: number;
    maximumDiscountAmount: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    usageLimit: number | null;
    usageCount: number;
    perCustomerLimit: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  storeEvents: Array<{
    id: number;
    storeId: number;
    productId: number | null;
    eventType: string;
    visitorId: string | null;
    metadata: string | null;
    createdAt: Date;
  }>;
  notifications: Array<{
    id: number;
    storeId: number;
    type: string;
    title: string;
    message: string;
    relatedOrderId: number | null;
    relatedProductId: number | null;
    relatedCouponId: number | null;
    href: string | null;
    read: boolean;
    dedupeKey: string | null;
    createdAt: Date;
  }>;
  couponProducts: Array<{
    id: number;
    couponId: number;
    productId: number;
  }>;
  campaigns: Array<{
    id: number;
    storeId: number;
    name: string;
    slug: string;
    description: string;
    campaignType: string;
    status: string;
    startsAt: Date | null;
    endsAt: Date | null;
    bannerUrl: string | null;
    announcementText: string | null;
    couponId: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  campaignProducts: Array<{
    id: number;
    campaignId: number;
    productId: number;
  }>;
  subscriptionPlans: Array<{
    id: number; name: string; slug: string; description: string; priceKobo: number;
    billingInterval: string; productLimit: number | null; featuresJson: string;
    providerPlanCode: string | null;
    active: boolean; sortOrder: number; createdAt: Date; updatedAt: Date;
  }>;
  subscriptions: Array<{
    id: number; storeId: number; planId: number; status: string; provider: string;
    providerSubscriptionCode: string | null; providerCustomerCode: string | null;
    providerAuthorizationCode: string | null; providerEmailToken: string | null;
    currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean; canceledAt: Date | null; createdAt: Date; updatedAt: Date;
  }>;
  billingTransactions: Array<{
    id: number; storeId: number; subscriptionId: number | null; provider: string;
    reference: string; amountKobo: number; currency: string; status: string;
    transactionType: string; planId: number | null; rawEventId: string | null;
    createdAt: Date; updatedAt: Date;
  }>;
  subscriptionEvents: Array<{
    id: number; subscriptionId: number; eventType: string; providerEventId: string | null;
    metadata: string | null; processedAt: Date; createdAt: Date;
  }>;
  sellerWallets: Array<{
    id: number; storeId: number; availableKobo: number; pendingKobo: number;
    lifetimeEarnedKobo: number; lifetimeWithdrawnKobo: number; debtKobo: number;
    createdAt: Date; updatedAt: Date;
  }>;
  walletLedger: Array<{
    id: number; storeId: number; walletId: number; entryType: string; direction: string;
    amountKobo: number; balanceAfterAvailableKobo: number; balanceAfterPendingKobo: number;
    orderId: number | null; withdrawalId: number | null; reference: string;
    idempotencyKey: string; providerEventId: string | null; metadata: string | null; createdAt: Date;
  }>;
  sellerBankAccounts: Array<{
    id: number; storeId: number; bankCode: string; bankName: string;
    accountNumberLast4: string; accountName: string; recipientCode: string;
    active: boolean; createdAt: Date; updatedAt: Date;
  }>;
  withdrawals: Array<{
    id: number; storeId: number; walletId: number; bankAccountId: number | null;
    amountKobo: number; feeKobo: number; netKobo: number; status: string;
    reference: string; transferCode: string | null; recipientCode: string | null;
    failureReason: string | null; providerEventId: string | null;
    createdAt: Date; processingAt: Date | null; completedAt: Date | null;
    failedAt: Date | null; reversedAt: Date | null; updatedAt: Date;
  }>;
  seq: {
    user: number; store: number; product: number; order: number; item: number;
    coupon: number; couponProduct: number; payment: number; productImage: number;
    storeEvent: number; notification: number; campaign: number; campaignProduct: number;
    subscriptionPlan: number; subscription: number; billingTransaction: number; subscriptionEvent: number;
    sellerWallet: number; walletLedger: number; sellerBankAccount: number; withdrawal: number;
  };
};

export function createMemoryStore(): MemoryStore {
  return {
    users: [], stores: [], products: [], orders: [], orderItems: [], payments: [],
    productImages: [], coupons: [], storeEvents: [], notifications: [], couponProducts: [],
    campaigns: [], campaignProducts: [], subscriptionPlans: [], subscriptions: [],
    billingTransactions: [], subscriptionEvents: [], sellerWallets: [], walletLedger: [], sellerBankAccounts: [], withdrawals: [],
    seq: {
      user: 1, store: 1, product: 1, order: 1, item: 1, payment: 1, productImage: 1,
      coupon: 1, couponProduct: 1, storeEvent: 1, notification: 1, campaign: 1, campaignProduct: 1,
      subscriptionPlan: 1, subscription: 1, billingTransaction: 1, subscriptionEvent: 1, sellerWallet: 1, walletLedger: 1, sellerBankAccount: 1, withdrawal: 1,
    },
  };
}

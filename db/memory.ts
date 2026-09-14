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
  couponProducts: Array<{
    id: number;
    couponId: number;
    productId: number;
  }>;
  seq: {
    user: number;
    store: number;
    product: number;
    order: number;
    item: number;
    coupon: number;
    couponProduct: number;
    payment: number;
    productImage: number;
    storeEvent: number;
  };
};

export function createMemoryStore(): MemoryStore {
  return {
    users: [],
    stores: [],
    products: [],
    orders: [],
    orderItems: [],
    payments: [],
    productImages: [],
    coupons: [],
    storeEvents: [],
    couponProducts: [],
    seq: { user: 1, store: 1, product: 1, order: 1, item: 1, payment: 1, productImage: 1, coupon: 1, couponProduct: 1, storeEvent: 1 },
  };
}

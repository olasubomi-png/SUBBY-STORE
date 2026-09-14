export type CustomerType = "new" | "returning" | "vip";

export type CustomerSummary = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  totalOrders: number;
  paidOrders: number;
  totalSpentKobo: number;
  firstOrderAt: string;
  lastOrderAt: string;
  type: CustomerType;
};

export type CustomerOrderLine = {
  id: number;
  paymentReference: string | null;
  paymentStatus: string;
  orderStatus: string;
  totalKobo: number;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    lineTotalKobo: number;
  }>;
};

export type CustomerDetail = CustomerSummary & {
  orders: CustomerOrderLine[];
  products: Array<{ productName: string; quantity: number }>;
};

export type CustomerInsights = {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  vipCustomers: number;
  totalRevenueKobo: number;
  averageOrderValueKobo: number;
  repeatPurchaseRate: number | null;
};

export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function customerContactLinks(input: {
  phone?: string | null;
  email?: string | null;
}): { tel: string | null; whatsapp: string | null; mailto: string | null } {
  const digits = digitsOnly(input.phone || "");
  let wa: string | null = null;
  if (digits.length >= 10) {
    let intl = digits;
    if (intl.startsWith("0") && intl.length === 11) {
      intl = `234${intl.slice(1)}`;
    }
    wa = `https://wa.me/${intl}`;
  }
  const email = (input.email || "").trim();
  return {
    tel: digits.length >= 7 ? `tel:${digits}` : null,
    whatsapp: wa,
    mailto: email.includes("@") ? `mailto:${email}` : null,
  };
}

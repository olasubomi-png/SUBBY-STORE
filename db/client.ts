import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!_db) {
    _client = postgres(url, { max: 10, prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** In-memory fallback for tests without Postgres */
export type MemoryStore = {
  users: schema.User[];
  stores: schema.Store[];
  products: schema.Product[];
  orders: schema.Order[];
  orderItems: schema.OrderItem[];
  payments: (typeof schema.payments.$inferSelect)[];
  seq: { user: number; store: number; product: number; order: number; item: number; payment: number };
};

export function createMemoryStore(): MemoryStore {
  return {
    users: [],
    stores: [],
    products: [],
    orders: [],
    orderItems: [],
    payments: [],
    seq: { user: 1, store: 1, product: 1, order: 1, item: 1, payment: 1 },
  };
}

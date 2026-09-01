import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is required in production (in-memory DB is not allowed)"
      );
    }
    throw new Error("DATABASE_URL is not configured");
  }
  if (!_db) {
    _client = postgres(url, { max: 10, prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export type { MemoryStore } from "./memory";
export { createMemoryStore } from "./memory";

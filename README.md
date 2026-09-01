# SUBBY STORE

Mobile-first Nigerian ecommerce for small businesses.

**Business → Store → Product → Customer → Order → Payment**

## Stack

- Next.js 15 (App Router)
- TypeScript
- PostgreSQL + Drizzle ORM
- Paystack (NGN)
- Tailwind CSS
- Vitest

## Local development

```bash
cp .env.example .env
# Set SESSION_SECRET (32+ chars). Optional: DATABASE_URL for Postgres.
# Without DATABASE_URL, the app uses an in-memory store (dev/demo only).

npm install
npm run test
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT session signing (min 32 chars) |
| `PAYSTACK_SECRET_KEY` | Server-only Paystack secret |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Public key (optional for V1 redirect flow) |
| `APP_URL` | Public app URL for Paystack callbacks |
| `USE_MEMORY_DB=1` | Force in-memory repository |

Paystack mock mode activates when `PAYSTACK_SECRET_KEY` contains `REPLACE` or equals `sk_test_mock`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run test` — unit tests
- `npm run typecheck` — TypeScript
- `npm run db:push` — push Drizzle schema (requires DATABASE_URL)

## Money

All amounts are **integer kobo** (1 NGN = 100 kobo). No floating-point wallet math.

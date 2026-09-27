# Setup Guide — Windows / macOS / Linux, no Docker

## Prerequisites

- Node.js 20+ (Node 22 LTS recommended)
- npm
- PostgreSQL 15+ and optionally pgAdmin 4

## 1. Create PostgreSQL database

You may create the database in pgAdmin or run `database/01-create-database.sql` as a superuser. For a simple local setup you can instead use your existing `postgres` account and create only a database named `nexus_dashboard`.

Example connection string:

`postgresql://postgres:YOUR_PASSWORD@localhost:5432/nexus_dashboard?schema=public`

## 2. Backend configuration

Open a terminal in `backend`:

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

On Windows Command Prompt use `copy .env.example .env` instead of `cp`.

The API starts on port 5000.

## 3. Frontend configuration

Open another terminal in the project root:

```bash
cp .env.example .env
npm install
npm run dev
```

The frontend starts on port 5173 and calls `http://localhost:5000/api`.

## 4. Verify the database

Open `http://localhost:5000/api/health`. Expected response includes `database: connected`.

To inspect tables visually:

```bash
cd backend
npx prisma studio
```

Or use pgAdmin: Servers → PostgreSQL → Databases → nexus_dashboard → Schemas → public → Tables.

## 5. Seed account

- Email: `admin@nexus.local`
- Password: `Admin@123`

Change this immediately for any shared environment.

## 6. Prisma workflow for future schema changes

Edit `backend/prisma/schema.prisma`, then run:

```bash
npx prisma migrate dev --name describe_your_change
npx prisma generate
```

Commit both the Prisma schema and the generated migration folder. In production run `npx prisma migrate deploy`; do not use `migrate dev` against production.

## 7. Security before production

- Set `DEV_BYPASS_AUTH=false`.
- Set a long random `JWT_SECRET`.
- Use HTTPS.
- Put uploaded files on controlled persistent storage rather than a public static directory.
- Restrict CORS to the real frontend origin.
- Use a separate PostgreSQL application user, not the superuser.
- Back up PostgreSQL and the document storage together.

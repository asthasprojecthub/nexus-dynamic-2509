# Nexus Dashboard Unified Setup

Use the root `README.md` as the primary setup guide.

Important paths:

- Frontend: `frontend/`
- Backend: `backend/`
- Prisma: `backend/prisma/schema.prisma`
- Fresh DB helper: `database/01-create-database.sql`
- Existing DB base upgrade: `database/07-existing-db-latest-upgrade.sql`
- Unified status/timesheet upgrade: `database/08-unified-status-timesheet.sql`

For a brand-new empty database use `npx prisma db push` from `backend/`, then `npm run db:seed` only if demo/bootstrap data is wanted.

For a real existing database: back up first, apply scripts 07 and 08 in order, run `npx prisma validate` and `npx prisma generate`, and **do not seed**.

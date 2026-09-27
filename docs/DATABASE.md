# Database Notes

The source of truth is `backend/prisma/schema.prisma`. Prisma migrations generated from this file create the PostgreSQL tables, foreign keys, indexes and uniqueness constraints.

Important design choices:

1. UUID primary keys are used for business/master records.
2. Dynamic field definitions are normalized and versioned; values are stored against field IDs.
3. HOD multi-department access is represented by `user_departments` with a role per membership.
4. One common meeting structure handles inquiry kickoff and project meetings.
5. One generic notification structure handles all application events and per-user read state.
6. Audit log data is append-oriented; do not use it as the operational source of truth.
7. Documents are metadata in PostgreSQL and binary files in protected storage. In cloud deployment, replace local `uploads` storage with S3/Azure Blob/etc. while keeping the database metadata model.

## Useful commands

```bash
npx prisma format
npx prisma validate
npx prisma migrate dev --name init
npx prisma studio
npm run db:seed
```

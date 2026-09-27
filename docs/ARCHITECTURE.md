# Architecture

## Stack

Frontend: React 18 + Vite + Tailwind CSS. Backend: Node.js + Express. ORM: Prisma. Database: PostgreSQL. Authentication: JWT. Validation/security foundation: Helmet, rate limiting and backend authorization hook. File handling: Multer with protected download endpoint.

## Main database domains

**Security:** `roles`, `permissions`, `role_permissions`, `users`, `user_departments`. A user can hold a department-specific role through `user_departments`, which supports the required multi-department HOD design while TL/Employee memberships remain department-scoped.

**Customers:** `customers`, `customer_departments`, `customer_contacts`.

**Dynamic forms:** `form_masters`, `form_versions`, `form_sections`, `form_fields`, `form_field_options`. Inquiry, project and panel forms use the same versioned form engine. Existing records can keep references to the form version they were created from.

**Panels:** `panel_masters`; each panel master references its own form master and therefore supports independent version history.

**Inquiry:** `inquiries`, `inquiry_panels`, `inquiry_field_values`, `inquiry_panel_field_values`.

**Project:** `projects`, `project_departments`, `project_panels`, `project_field_values`, `project_panel_field_values`, `project_planning`, `planning_task_masters`, `planning_task_notes`.

**Documents:** `document_types`, `documents`, `inquiry_documents`, `project_documents`. Files are not exposed by `express.static`; download goes through `/api/documents/:id/download`.

**Meetings:** common `meetings` plus `meeting_users`. A meeting belongs to either one inquiry or one project. Use `meeting_type=KICKOFF` for inquiry kickoff meetings and `meeting_type=PROJECT` for normal project meetings.

**Notifications:** `notifications`, `notification_recipients`. The structure is generic so inquiry created/status changed, project/task changes, meeting creation and other events can all use the same tables.

**Audit:** `audit_logs` records module/action/user/record/IP and old/new JSON values.

## Frontend integration

The original localStorage store was replaced by an API-backed store. It loads `/api/bootstrap` when the application starts, keeps an optimistic UI state, sends changes to REST endpoints and reloads normalized PostgreSQL data after writes.

A small `ui_data` JSONB snapshot is stored on Inquiry and Project in addition to normalized fields. This exists to preserve the current frontend's still-evolving dynamic payload while the stable ERD fields remain normalized. New production features should prefer dedicated normalized tables/field-value tables rather than adding arbitrary columns.

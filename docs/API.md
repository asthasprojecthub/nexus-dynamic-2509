# REST API Reference

Base URL: `http://localhost:5000/api`

When `DEV_BYPASS_AUTH=false`, send `Authorization: Bearer <token>` to protected endpoints.

## System and authentication

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | API + PostgreSQL health check |
| POST | `/auth/login` | Get JWT token |
| GET | `/bootstrap` | Load all reference/master/inquiry/project data required by the current frontend |

Login body: `{ "email": "admin@nexus.local", "password": "Admin@123" }`

## Master/reference data

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/customers` | List/create customers |
| PATCH | `/customers/:id` | Update customer |
| POST | `/departments` | Create department |
| PATCH | `/departments/:id` | Update department |
| POST | `/users` | Create user |
| PATCH | `/users/:id` | Update user |
| POST | `/document-types` | Create document type |
| PATCH | `/document-types/:id` | Update document type |
| POST | `/panel-masters` | Create panel master |
| PATCH | `/panel-masters/:id` | Update panel master |
| POST | `/panel-masters/:id/versions` | Add panel form version |
| POST | `/masters/inquiry/versions` | Add inquiry master version |
| POST | `/masters/project/versions` | Add project master version |
| PATCH | `/form-versions/:id` | Rename/activate/deactivate a form version |
| POST | `/planning/tasks` | Add planning task master |
| PATCH/DELETE | `/planning/tasks/:id` | Update/archive planning task |

## Business data

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/inquiries` | Create inquiry |
| PATCH | `/inquiries/:id` | Update inquiry |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update project |
| GET | `/meetings?inquiry_id=...` | Inquiry meetings |
| GET | `/meetings?project_id=...` | Project meetings |
| POST | `/meetings` | Create kickoff/project meeting and attendees |
| GET | `/notifications` | Current user's notifications |
| PATCH | `/notifications/:id/read` | Mark notification read |
| GET | `/audit-logs` | Audit trail |

## Documents

`POST /documents/upload` uses `multipart/form-data` with fields:

- `file` — actual file
- `record_type` — `inquiry` or `project`
- `record_id` — inquiry/project UUID
- `document_type_id` — document type UUID
- `description` — optional
- `version_no` — integer

Download: `GET /documents/:id/download`.

The backend intentionally does **not** expose the upload directory through a public static route.

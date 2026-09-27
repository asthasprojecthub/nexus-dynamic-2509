# Unified Feature Map

## Workspace

| Module | Included behavior |
|---|---|
| Inquiry | Dynamic Inquiry + panel information, fixed core fields, status workflow, document workflow, kickoff and project conversion |
| Project | Dynamic project fields, panels/departments, planning grid, meetings, documents, activity page and source-inquiry locking |
| Customer | Normal operational page; customer/contact details and 10-digit mobile validation in API workflows |
| Timesheet | Self/Team switching, List/Kanban/Calendar views, user-created work and Project Planning linked work |

## Masters

| Master | Purpose |
|---|---|
| Inquiry Master | Versioned dynamic Inquiry fields plus Inquiry Status Master |
| Panel Master | Dynamic panel-type forms and versions |
| Project Master | Versioned Project dynamic fields |
| Planning Grid Master | Department/task definitions used by Project Planning |
| Department Master | Internal Nexus departments used for HOD/TL/Employee scope and project work |
| User Management | Admin/HOD/TL/Employee accounts, departments, role defaults and individual permission overrides |
| Timesheet Master | Cross-user task management according to permissions |
| Document Type Master | Hierarchical document types such as BOM -> Technical/Commercial |
| Audit Log | Old/new value audit trail for controlled changes |

## Role rules

- Admin: all departments and all access.
- HOD: must be assigned to at least two departments.
- Team Lead: exactly one department.
- Employee: exactly one department.
- Role permissions define defaults; user permissions can override individual access.

## Inquiry status / Project relationship

- Statuses come from Inquiry Status Master.
- Statuses can require a popup/reason/documents.
- Order Won can proceed through kickoff and convert to Project.
- Conversion does not change Inquiry status to `Converted`; it remains `Order Won`.
- Changing a converted Inquiry to `Order Lost` or `Inquiry Hold` locks the linked Project.
- Returning it to `Order Won` makes the linked Project editable again.

## Timeline rules

The four fixed timeline fields are system-controlled and cannot be removed from dynamic masters:

1. Start Date — automatically populated.
2. Timeline (Weeks) — manual integer.
3. Expected End Date — calculated from Start Date + Timeline.
4. Actual End Date — entered manually.

Project Planning uses corresponding row-level schedule fields and assigned rows synchronize with Timesheet.

-- Nexus User Management / API permission catalog upgrade.
-- Safe for an existing database: only inserts missing permission rows and role defaults.
-- Existing user_permissions overrides are preserved.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.permissions (id, permission_key, module, action, description, is_active, created_at)
SELECT gen_random_uuid(), v.permission_key, v.module, v.action, v.description, TRUE, CURRENT_TIMESTAMP
FROM (VALUES
  ('DASHBOARD.VIEW','DASHBOARD','VIEW','View Dashboard'),

  ('INQUIRIES.CREATE','INQUIRIES','CREATE','Create Inquiry'),
  ('INQUIRIES.VIEW','INQUIRIES','VIEW','View Inquiry'),
  ('INQUIRIES.UPDATE','INQUIRIES','UPDATE','Edit Inquiry'),
  ('INQUIRIES.FOLLOW_UP','INQUIRIES','FOLLOW_UP','Follow-up / Reminder'),
  ('INQUIRIES.COMMERCIAL_SUBMIT','INQUIRIES','COMMERCIAL_SUBMIT','Commercial Submit'),
  ('INQUIRIES.STATUS_CHANGE','INQUIRIES','STATUS_CHANGE','Change Inquiry Status'),
  ('INQUIRIES.KICKOFF','INQUIRIES','KICKOFF','Schedule / Edit Kickoff'),
  ('INQUIRIES.CONVERT_TO_PROJECT','INQUIRIES','CONVERT_TO_PROJECT','Kickoff Done / Convert to Project'),

  ('PROJECTS.CREATE','PROJECTS','CREATE','Create Project'),
  ('PROJECTS.VIEW','PROJECTS','VIEW','View Project'),
  ('PROJECTS.UPDATE','PROJECTS','UPDATE','Edit Project'),
  ('PROJECTS.PLANNING_GRID','PROJECTS','PLANNING_GRID','Project Planning Grid'),
  ('PROJECTS.DUPLICATE_PLANNING_GRID','PROJECTS','DUPLICATE_PLANNING_GRID','Add Duplicate Planning Grid'),
  ('PROJECTS.UPDATE_COMPLETION','PROJECTS','UPDATE_COMPLETION','Update Completion %'),
  ('PROJECTS.MARK_COMPLETED','PROJECTS','MARK_COMPLETED','Mark Completed'),
  ('PROJECTS.UPLOAD_DOCUMENTS','PROJECTS','UPLOAD_DOCUMENTS','Upload Project Documents'),

  ('CUSTOMERS.CREATE','CUSTOMERS','CREATE','Create Customer'),
  ('CUSTOMERS.VIEW','CUSTOMERS','VIEW','View Customer'),
  ('CUSTOMERS.UPDATE','CUSTOMERS','UPDATE','Edit Customer'),

  ('NOTIFICATIONS.VIEW','NOTIFICATIONS','VIEW','View Notifications'),
  ('NOTIFICATIONS.SEND','NOTIFICATIONS','SEND','Send Notifications'),

  ('TIMESHEET.CREATE','TIMESHEET','CREATE','Fill Timesheet'),
  ('TIMESHEET.VIEW','TIMESHEET','VIEW','View Own Timesheet'),
  ('TIMESHEET.UPDATE','TIMESHEET','UPDATE','Edit Own Timesheet'),
  ('TIMESHEET.TEAM_VIEW','TIMESHEET','TEAM_VIEW','View Team Timesheet'),
  ('TIMESHEET.ASSIGN','TIMESHEET','ASSIGN','Assign / Reassign Timesheet'),
  ('TIMESHEET.APPROVE','TIMESHEET','APPROVE','Approve Timesheet'),

  ('TIMESHEET_MASTER.VIEW','TIMESHEET_MASTER','VIEW','View Timesheet Master'),
  ('TIMESHEET_MASTER.CREATE','TIMESHEET_MASTER','CREATE','Create Team Task'),
  ('TIMESHEET_MASTER.UPDATE','TIMESHEET_MASTER','UPDATE','Edit Team Task'),
  ('TIMESHEET_MASTER.ASSIGN','TIMESHEET_MASTER','ASSIGN','Assign Team Task'),
  ('TIMESHEET_MASTER.DELETE','TIMESHEET_MASTER','DELETE','Archive Team Task'),

  ('INQUIRY_MASTER.VIEW','INQUIRY_MASTER','VIEW','View Inquiry Master'),
  ('INQUIRY_MASTER.CREATE','INQUIRY_MASTER','CREATE','Create Inquiry Master Version / Status'),
  ('INQUIRY_MASTER.UPDATE','INQUIRY_MASTER','UPDATE','Edit Inquiry Master Version / Status'),
  ('PANEL_MASTER.VIEW','PANEL_MASTER','VIEW','View Panel Master'),
  ('PANEL_MASTER.CREATE','PANEL_MASTER','CREATE','Create Panel / Version'),
  ('PANEL_MASTER.UPDATE','PANEL_MASTER','UPDATE','Edit Panel / Version'),
  ('PROJECT_MASTER.VIEW','PROJECT_MASTER','VIEW','View Project Master'),
  ('PROJECT_MASTER.CREATE','PROJECT_MASTER','CREATE','Create Project Master Version'),
  ('PROJECT_MASTER.UPDATE','PROJECT_MASTER','UPDATE','Edit Project Master Version'),
  ('PLANNING_GRID_MASTER.VIEW','PLANNING_GRID_MASTER','VIEW','View Planning Grid Master'),
  ('PLANNING_GRID_MASTER.CREATE','PLANNING_GRID_MASTER','CREATE','Create Planning Grid Version / Task'),
  ('PLANNING_GRID_MASTER.UPDATE','PLANNING_GRID_MASTER','UPDATE','Edit Planning Grid Version / Task'),
  ('PLANNING_GRID_MASTER.DELETE','PLANNING_GRID_MASTER','DELETE','Deactivate Planning Task'),
  ('DEPARTMENTS.VIEW','DEPARTMENTS','VIEW','View Department Master'),
  ('DEPARTMENTS.CREATE','DEPARTMENTS','CREATE','Create Department'),
  ('DEPARTMENTS.UPDATE','DEPARTMENTS','UPDATE','Edit Department'),
  ('DOCUMENT_TYPES.VIEW','DOCUMENT_TYPES','VIEW','View Document Type Master'),
  ('DOCUMENT_TYPES.CREATE','DOCUMENT_TYPES','CREATE','Create Document Type'),
  ('DOCUMENT_TYPES.UPDATE','DOCUMENT_TYPES','UPDATE','Edit Document Type'),
  ('USERS.VIEW','USERS','VIEW','View Users'),
  ('USERS.CREATE','USERS','CREATE','Create User'),
  ('USERS.UPDATE','USERS','UPDATE','Edit User'),
  ('USERS.MANAGE_ACCESS','USERS','MANAGE_ACCESS','Manage User Permissions'),
  ('AUDIT_LOGS.VIEW','AUDIT_LOGS','VIEW','View Audit Logs')
) AS v(permission_key,module,action,description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE p.permission_key = v.permission_key
);

-- Ensure Admin has every current permission. The API also treats ADMIN as organization-wide.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'ADMIN' AND p.is_active = TRUE
ON CONFLICT DO NOTHING;

-- Keep existing non-admin behavior when moving project-task permissions to the new Project permission names.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM public.role_permissions rp
JOIN public.permissions oldp ON oldp.id = rp.permission_id
JOIN public.permissions target ON target.permission_key = 'PROJECTS.PLANNING_GRID'
WHERE oldp.permission_key IN ('PROJECT_TASKS.VIEW','PROJECT_TASKS.CREATE','PROJECT_TASKS.UPDATE','PROJECT_TASKS.ASSIGN')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM public.role_permissions rp
JOIN public.permissions oldp ON oldp.id = rp.permission_id
JOIN public.permissions target ON target.permission_key = 'PROJECTS.DUPLICATE_PLANNING_GRID'
WHERE oldp.permission_key = 'PROJECT_TASKS.CREATE'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM public.role_permissions rp
JOIN public.permissions oldp ON oldp.id = rp.permission_id
JOIN public.permissions target ON target.permission_key = 'PROJECTS.UPDATE_COMPLETION'
WHERE oldp.permission_key = 'PROJECT_TASKS.UPDATE'
ON CONFLICT DO NOTHING;

-- Status managers keep kickoff/commercial/convert capability after the catalog is expanded.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM public.role_permissions rp
JOIN public.permissions oldp ON oldp.id = rp.permission_id
JOIN public.permissions target ON target.permission_key IN (
  'INQUIRIES.FOLLOW_UP','INQUIRIES.KICKOFF','INQUIRIES.COMMERCIAL_SUBMIT','INQUIRIES.CONVERT_TO_PROJECT'
)
WHERE oldp.permission_key = 'INQUIRIES.STATUS_CHANGE'
ON CONFLICT DO NOTHING;

-- Existing project status managers can mark projects completed.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM public.role_permissions rp
JOIN public.permissions oldp ON oldp.id = rp.permission_id
JOIN public.permissions target ON target.permission_key = 'PROJECTS.MARK_COMPLETED'
WHERE oldp.permission_key = 'PROJECTS.STATUS_CHANGE'
ON CONFLICT DO NOTHING;

-- Dashboard is a general permission for active standard roles.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_key = 'DASHBOARD.VIEW'
WHERE r.role_code IN ('HOD','TL','EMPLOYEE')
ON CONFLICT DO NOTHING;

-- Timesheet approval defaults to HOD; Admin already receives all permissions.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_key = 'TIMESHEET.APPROVE'
WHERE r.role_code = 'HOD'
ON CONFLICT DO NOTHING;

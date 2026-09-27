-- System Rule: remove the "Delete" capability from Inquiry and Project
-- modules entirely (no backend route ever implemented it; this was a
-- dead permission toggle in the admin access-control matrix only).
-- Deleting the permission rows cascades to role_permissions and
-- user_permissions (see prisma schema onDelete: Cascade), so any
-- existing grants for these two keys are removed as well.
DELETE FROM public.permissions
WHERE permission_key IN ('INQUIRIES.DELETE', 'PROJECTS.DELETE');

-- New narrower permission: lets a user (e.g. Estimation Team) upload
-- documents to a project without needing full PROJECTS.UPDATE rights.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.permissions (id, permission_key, module, action, description, is_active, created_at)
SELECT gen_random_uuid(), 'PROJECTS.UPLOAD_DOCUMENTS', 'PROJECTS', 'UPLOAD_DOCUMENTS', 'Upload Project Documents', TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE permission_key = 'PROJECTS.UPLOAD_DOCUMENTS'
);

-- Admin keeps every permission automatically (see ensureAccessCatalog),
-- but grant it explicitly here too so a fresh Admin role is covered
-- immediately after this migration runs.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.role_code = 'ADMIN' AND p.permission_key = 'PROJECTS.UPLOAD_DOCUMENTS'
ON CONFLICT DO NOTHING;

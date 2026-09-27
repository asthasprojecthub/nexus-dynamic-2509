-- Business rule: "Allow HODs and TLs to create ... their own projects."
-- TL previously had PROJECTS.UPDATE but not PROJECTS.CREATE. Grant it.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.role_code = 'TL' AND p.permission_key = 'PROJECTS.CREATE'
ON CONFLICT DO NOTHING;

-- Business rule: "Grant all department employees View and Edit Status
-- access via the Project Planning Grid." The route already restricts an
-- Employee to changing the status of only the planning-grid task
-- explicitly assigned to them (see PATCH /api/projects/:id/planning-tasks/:taskId);
-- this just grants the underlying permission the route requires.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.role_code = 'EMPLOYEE' AND p.permission_key = 'PROJECTS.UPDATE_COMPLETION'
ON CONFLICT DO NOTHING;


 

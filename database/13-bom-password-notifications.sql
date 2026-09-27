-- Apply once after 12-active-master-versions.sql on an existing database.
-- Adds the reset-password permission without running the destructive demo seed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO permissions (id, permission_key, module, action, description, is_active, created_at)
VALUES (gen_random_uuid(),'USERS.RESET_PASSWORD','USERS','RESET_PASSWORD','Reset another user password',TRUE,NOW())
ON CONFLICT (permission_key) DO UPDATE SET is_active=TRUE;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='USERS.RESET_PASSWORD'
WHERE r.role_code='ADMIN' ON CONFLICT DO NOTHING;

-- Reuse an existing BOM parent. Both required subtypes belong directly under it.
INSERT INTO document_types (id,document_type_code,document_type_name,is_active)
SELECT gen_random_uuid(),'BOM','Bill of Material',TRUE
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE parent_document_type_id IS NULL
  AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%'))
ON CONFLICT (document_type_code) DO NOTHING;

WITH bom_root AS (
  SELECT id FROM document_types WHERE parent_document_type_id IS NULL
    AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%')
  ORDER BY CASE WHEN upper(document_type_code)='BOM' THEN 0 ELSE 1 END LIMIT 1
)
UPDATE document_types SET is_active=TRUE WHERE id IN (SELECT id FROM bom_root);

-- Older installations may have created these two types as standalone roots.
WITH bom_root AS (
  SELECT id FROM document_types WHERE parent_document_type_id IS NULL
    AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%')
  ORDER BY CASE WHEN upper(document_type_code)='BOM' THEN 0 ELSE 1 END LIMIT 1
)
UPDATE document_types d SET parent_document_type_id=b.id,is_active=TRUE FROM bom_root b
WHERE d.document_type_code IN ('BOM_TECHNICAL','BOM_COMMERCIAL') AND d.id<>b.id;

WITH bom_root AS (
  SELECT id FROM document_types WHERE parent_document_type_id IS NULL
    AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%')
  ORDER BY CASE WHEN upper(document_type_code)='BOM' THEN 0 ELSE 1 END LIMIT 1
)
UPDATE document_types d SET is_active=TRUE FROM bom_root b
WHERE d.parent_document_type_id=b.id
  AND (regexp_replace(lower(d.document_type_code||d.document_type_name),'[^a-z0-9]','','g') LIKE '%technical%'
       OR regexp_replace(lower(d.document_type_code||d.document_type_name),'[^a-z0-9]','','g') LIKE '%commercial%');

WITH bom_root AS (
  SELECT id FROM document_types WHERE parent_document_type_id IS NULL
    AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%')
  ORDER BY CASE WHEN upper(document_type_code)='BOM' THEN 0 ELSE 1 END LIMIT 1
)
INSERT INTO document_types (id,document_type_code,document_type_name,parent_document_type_id,is_active)
SELECT gen_random_uuid(),'BOM_TECHNICAL','Technical BOM',b.id,TRUE FROM bom_root b
WHERE NOT EXISTS (SELECT 1 FROM document_types d WHERE d.parent_document_type_id=b.id
  AND regexp_replace(lower(d.document_type_code||d.document_type_name),'[^a-z0-9]','','g') LIKE '%technical%'
  AND regexp_replace(lower(d.document_type_code||d.document_type_name),'[^a-z0-9]','','g') NOT LIKE '%nontechnical%')
ON CONFLICT (document_type_code) DO NOTHING;

WITH bom_root AS (
  SELECT id FROM document_types WHERE parent_document_type_id IS NULL
    AND (upper(document_type_code)='BOM' OR regexp_replace(lower(document_type_name),'[^a-z0-9]','','g') LIKE '%billofmaterial%')
  ORDER BY CASE WHEN upper(document_type_code)='BOM' THEN 0 ELSE 1 END LIMIT 1
)
INSERT INTO document_types (id,document_type_code,document_type_name,parent_document_type_id,is_active)
SELECT gen_random_uuid(),'BOM_COMMERCIAL','Commercial BOM',b.id,TRUE FROM bom_root b
WHERE NOT EXISTS (SELECT 1 FROM document_types d WHERE d.parent_document_type_id=b.id
  AND regexp_replace(lower(d.document_type_code||d.document_type_name),'[^a-z0-9]','','g') LIKE '%commercial%')
ON CONFLICT (document_type_code) DO NOTHING;

-- Make earlier notifications visible to active Admins, including their own actions.
INSERT INTO notification_recipients (notification_id,user_id,is_read)
SELECT n.id,u.id,FALSE FROM notifications n CROSS JOIN users u JOIN roles r ON r.id=u.role_id
WHERE u.is_active AND r.role_code='ADMIN'
ON CONFLICT (notification_id,user_id) DO NOTHING;

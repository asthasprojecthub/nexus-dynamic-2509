-- Run once on an existing database after the earlier numbered upgrades.
-- Keep the newest version active for every Inquiry, Project and Panel master.
WITH ranked AS (
  SELECT id, form_master_id, ROW_NUMBER() OVER (PARTITION BY form_master_id ORDER BY version_no DESC, created_at DESC) AS rn
  FROM form_versions
), missing AS (
  SELECT r.id FROM ranked r
  WHERE r.rn=1 AND NOT EXISTS (
    SELECT 1 FROM form_versions v WHERE v.form_master_id=r.form_master_id AND v.is_active
  )
)
UPDATE form_versions SET is_active=TRUE WHERE id IN (SELECT id FROM missing);

-- Older Panel Masters can have been created without a form version.
INSERT INTO form_versions (id, form_master_id, version_no, version_name, is_active, created_at)
SELECT gen_random_uuid(), m.id, 1, m.form_name, TRUE, NOW()
FROM form_masters m WHERE NOT EXISTS (SELECT 1 FROM form_versions v WHERE v.form_master_id=m.id);

-- Preserve the currently configured Planning Grid when no version exists.
INSERT INTO planning_grid_versions (id, version_no, form_name, statuses, department_tasks, is_active, created_at, updated_at)
SELECT gen_random_uuid(), 1, 'Project Planning Grid',
  '["Pending","In Progress","Delay","Completed","On Hold"]'::jsonb,
  COALESCE((SELECT jsonb_object_agg(d.department_name, d.tasks)
    FROM (SELECT dep.department_name, jsonb_agg(jsonb_build_object('id',t.id,'name',t.task_name) ORDER BY t.display_order) tasks
          FROM planning_task_masters t JOIN departments dep ON dep.id=t.department_id
          WHERE t.is_active GROUP BY dep.department_name) d), '{}'::jsonb), TRUE, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM planning_grid_versions);

UPDATE planning_grid_versions SET is_active=TRUE
WHERE id=(SELECT id FROM planning_grid_versions ORDER BY version_no DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM planning_grid_versions WHERE is_active);

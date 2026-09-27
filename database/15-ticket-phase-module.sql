-- Nexus Ticket Module v2: Phase 1 intake, Phase 2 technical work,
-- multi-assignment, individual work timers, RMA and versioned form options.
-- Run this only after the old Ticket tables have been removed.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE ticket_workflow_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_code VARCHAR(60) NOT NULL UNIQUE,
  status_name VARCHAR(120) NOT NULL UNIQUE,
  status_category VARCHAR(60) NOT NULL DEFAULT 'ACTIVE',
  sequence INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(20) NOT NULL DEFAULT '#2563eb',
  sla_days INTEGER NOT NULL DEFAULT 3 CHECK (sla_days >= 0),
  popup_required BOOLEAN NOT NULL DEFAULT FALSE,
  dynamic_fields JSONB,
  allowed_next_status_codes JSONB,
  allowed_role_codes JSONB,
  allowed_department_ids JSONB,
  notification_rules JSONB,
  escalation_rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_workflow_statuses_active_sequence_idx
  ON ticket_workflow_statuses(is_active,sequence);

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no VARCHAR(50) NOT NULL UNIQUE,
  subject VARCHAR(220) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  ticket_type VARCHAR(60) NOT NULL,
  problem_type VARCHAR(120) NOT NULL,
  manufacturer VARCHAR(120),
  model_number VARCHAR(160) NOT NULL,
  received_via VARCHAR(80),
  warranty_status VARCHAR(80),
  support_mode VARCHAR(80),
  support_type VARCHAR(80),
  complaint TEXT NOT NULL,
  customer_comment TEXT,
  priority VARCHAR(40) NOT NULL DEFAULT 'Medium',
  inquiry_id UUID REFERENCES inquiries(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  form_version_id UUID REFERENCES form_versions(id) ON DELETE SET NULL,
  current_phase INTEGER NOT NULL DEFAULT 1 CHECK (current_phase IN (1,2)),
  phase1_data JSONB,
  phase1_submitted_at TIMESTAMPTZ(6),
  repair_location VARCHAR(100),
  phase2_data JSONB,
  phase2_submitted_at TIMESTAMPTZ(6),
  rma_no VARCHAR(80),
  rma_data JSONB,
  rma_generated_at TIMESTAMPTZ(6),
  current_status_id UUID NOT NULL REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  status_entered_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  sla_due_at TIMESTAMPTZ(6),
  is_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  overdue_notified_at TIMESTAMPTZ(6),
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ(6)
);
CREATE INDEX tickets_status_overdue_idx ON tickets(current_status_id,is_overdue);
CREATE INDEX tickets_customer_created_idx ON tickets(customer_id,created_at);
CREATE INDEX tickets_phase_created_idx ON tickets(current_phase,created_at);

CREATE TABLE ticket_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_assignments_ticket_active_idx ON ticket_assignments(ticket_id,is_active);
CREATE INDEX ticket_assignments_user_active_idx ON ticket_assignments(user_id,is_active);
CREATE INDEX ticket_assignments_department_active_idx ON ticket_assignments(department_id,is_active);

CREATE TABLE ticket_work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','PAUSED','STOPPED')),
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  last_resumed_at TIMESTAMPTZ(6),
  paused_at TIMESTAMPTZ(6),
  stopped_at TIMESTAMPTZ(6),
  elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  remarks TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_work_sessions_ticket_user_started_idx
  ON ticket_work_sessions(ticket_id,user_id,started_at);
CREATE INDEX ticket_work_sessions_user_status_idx
  ON ticket_work_sessions(user_id,status);

CREATE TABLE ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status_id UUID REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  to_status_id UUID NOT NULL REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  response_data JSONB,
  note TEXT,
  sla_days_snapshot INTEGER NOT NULL DEFAULT 3,
  sla_due_at TIMESTAMPTZ(6),
  was_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  changed_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_status_history_ticket_changed_idx
  ON ticket_status_history(ticket_id,changed_at);

CREATE TABLE ticket_documents (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status_history_id UUID REFERENCES ticket_status_history(id) ON DELETE SET NULL,
  description TEXT,
  document_role VARCHAR(30) NOT NULL DEFAULT 'ATTACHMENT',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY(ticket_id,document_id)
);
CREATE INDEX ticket_documents_status_history_idx ON ticket_documents(status_history_id);
CREATE INDEX ticket_documents_role_idx ON ticket_documents(ticket_id,document_role);

ALTER TABLE timesheet_tasks ADD COLUMN IF NOT EXISTS ticket_id UUID;
ALTER TABLE timesheet_tasks DROP CONSTRAINT IF EXISTS timesheet_tasks_ticket_id_fkey;
ALTER TABLE timesheet_tasks
  ADD CONSTRAINT timesheet_tasks_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS timesheet_tasks_ticket_id_idx ON timesheet_tasks(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS timesheet_tasks_ticket_id_source_task_key_key
  ON timesheet_tasks(ticket_id,source_task_key);

INSERT INTO permissions (id,permission_key,module,action,description,is_active,created_at)
SELECT gen_random_uuid(),v.permission_key,v.module,v.action,v.description,TRUE,NOW()
FROM (VALUES
 ('TICKETS.CREATE','TICKETS','CREATE','Create and submit Ticket Phase 1'),
 ('TICKETS.VIEW','TICKETS','VIEW','View tickets'),
 ('TICKETS.UPDATE','TICKETS','UPDATE','Update ticket details'),
 ('TICKETS.ASSIGN','TICKETS','ASSIGN','Complete Phase 2 and assign teams'),
 ('TICKETS.STATUS_CHANGE','TICKETS','STATUS_CHANGE','Change ticket workflow status'),
 ('TICKET_MASTER.VIEW','TICKET_MASTER','VIEW','View Ticket Form versions'),
 ('TICKET_MASTER.CREATE','TICKET_MASTER','CREATE','Create Ticket Form versions'),
 ('TICKET_MASTER.UPDATE','TICKET_MASTER','UPDATE','Edit Ticket Form versions'),
 ('TICKET_WORKFLOW.VIEW','TICKET_WORKFLOW','VIEW','View Ticket Workflow'),
 ('TICKET_WORKFLOW.CREATE','TICKET_WORKFLOW','CREATE','Create Ticket workflow statuses'),
 ('TICKET_WORKFLOW.UPDATE','TICKET_WORKFLOW','UPDATE','Edit Ticket workflow statuses')
) AS v(permission_key,module,action,description)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_key=v.permission_key);

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code='ADMIN' AND p.module IN ('TICKETS','TICKET_MASTER','TICKET_WORKFLOW')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
 ('TICKETS.CREATE','TICKETS.VIEW','TICKETS.UPDATE','TICKETS.ASSIGN','TICKETS.STATUS_CHANGE','TICKET_MASTER.VIEW','TICKET_WORKFLOW.VIEW')
WHERE r.role_code IN ('HOD','TL') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
 ('TICKETS.CREATE','TICKETS.VIEW','TICKETS.STATUS_CHANGE')
WHERE r.role_code='EMPLOYEE' ON CONFLICT DO NOTHING;

INSERT INTO document_types(id,document_type_code,document_type_name,is_active)
VALUES(gen_random_uuid(),'TICKET_ATTACHMENT','Ticket Attachment',TRUE)
ON CONFLICT(document_type_code) DO UPDATE SET is_active=TRUE;
INSERT INTO document_types(id,document_type_code,document_type_name,is_active)
VALUES(gen_random_uuid(),'TICKET_RMA','Ticket RMA Document',TRUE)
ON CONFLICT(document_type_code) DO UPDATE SET is_active=TRUE;

INSERT INTO ticket_workflow_statuses
 (status_code,status_name,status_category,sequence,color,sla_days,popup_required,dynamic_fields,allowed_next_status_codes,allowed_role_codes,notification_rules,escalation_rules)
VALUES
 ('PHASE_1_SUBMITTED','Phase 1 Submitted','NEW',1,'#2563eb',3,FALSE,'[]','["TECHNICAL_REVIEW","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"roles":["ADMIN","HOD"]}','{"roles":["ADMIN","HOD","TL"]}'),
 ('TECHNICAL_REVIEW','Technical Review','ACTIVE',2,'#7c3aed',3,TRUE,'[{"key":"review_remark","label":"Technical Review Remark","type":"textarea","required":true}]','["ASSIGNED","HOLD"]','["ADMIN","HOD","TL"]','{"roles":["ADMIN","HOD"]}','{"roles":["ADMIN","HOD","TL"]}'),
 ('ASSIGNED','Assigned','ACTIVE',3,'#0891b2',3,FALSE,'[]','["DIAGNOSIS","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('DIAGNOSIS','Diagnosis','ACTIVE',4,'#0f766e',3,TRUE,'[{"key":"diagnosis","label":"Diagnosis","type":"textarea","required":true},{"key":"repair_required","label":"Repair Required","type":"yesno","required":true}]','["REPAIR_IN_PROGRESS","EXTERNAL_REPAIR","AWAITING_CUSTOMER_VENDOR","HOLD","RESOLVED"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('REPAIR_IN_PROGRESS','Repair In Progress','ACTIVE',5,'#ea580c',3,TRUE,'[{"key":"work_remark","label":"Work Remark","type":"textarea","required":true}]','["TESTING","AWAITING_CUSTOMER_VENDOR","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('EXTERNAL_REPAIR','External Repair','WAITING',6,'#d97706',3,TRUE,'[{"key":"vendor_name","label":"Vendor / Local Repairer","type":"text","required":true},{"key":"expected_return","label":"Expected Return","type":"date","required":true},{"key":"rma_required","label":"RMA Required","type":"yesno","required":true}]','["TESTING","AWAITING_CUSTOMER_VENDOR","HOLD"]','["ADMIN","HOD","TL"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('AWAITING_CUSTOMER_VENDOR','Awaiting Customer / Vendor','WAITING',7,'#ca8a04',3,TRUE,'[{"key":"waiting_for","label":"Waiting For","type":"dropdown","required":true,"options":["Customer","Vendor","Internal Approval"]},{"key":"follow_up_date","label":"Follow-up Date","type":"date","required":true}]','["DIAGNOSIS","REPAIR_IN_PROGRESS","TESTING","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('TESTING','Testing','ACTIVE',8,'#9333ea',3,TRUE,'[{"key":"test_result","label":"Test Result","type":"dropdown","required":true,"options":["Passed","Failed","Retest Required"]},{"key":"test_remark","label":"Test Remark","type":"textarea","required":true}]','["RESOLVED","REPAIR_IN_PROGRESS","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('HOLD','Hold','HOLD',9,'#64748b',3,TRUE,'[{"key":"hold_reason","label":"Hold Reason","type":"textarea","required":true},{"key":"expected_resume","label":"Expected Resume","type":"date","required":false}]','["TECHNICAL_REVIEW","DIAGNOSIS","REPAIR_IN_PROGRESS","EXTERNAL_REPAIR","TESTING"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('RESOLVED','Resolved','RESOLVED',10,'#16a34a',3,TRUE,'[{"key":"resolution","label":"Resolution Summary","type":"textarea","required":true},{"key":"customer_confirmation","label":"Customer Confirmation","type":"yesno","required":true}]','["CLOSED","DIAGNOSIS"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["ADMIN","HOD","TL"]}'),
 ('CLOSED','Closed','CLOSED',11,'#15803d',0,TRUE,'[{"key":"closure_remark","label":"Closure Remark","type":"textarea","required":false}]','[]','["ADMIN","HOD","TL"]','{"roles":["ADMIN"]}','{"roles":["ADMIN"]}');

INSERT INTO form_masters(id,form_code,form_name,form_type,is_active,created_at,updated_at)
VALUES(gen_random_uuid(),'TICKET_FORM','Ticket Form','TICKET',TRUE,NOW(),NOW())
ON CONFLICT(form_code) DO UPDATE SET form_name='Ticket Form',form_type='TICKET',is_active=TRUE,updated_at=NOW();

INSERT INTO form_versions(id,form_master_id,version_no,version_name,is_active,created_at)
SELECT gen_random_uuid(),fm.id,1,'Ticket Form v1',TRUE,NOW()
FROM form_masters fm
WHERE fm.form_code='TICKET_FORM'
  AND NOT EXISTS (SELECT 1 FROM form_versions fv WHERE fv.form_master_id=fm.id);

INSERT INTO form_sections(id,form_version_id,section_name,description,display_order,is_active)
SELECT gen_random_uuid(),fv.id,v.name,v.description,v.display_order,TRUE
FROM form_versions fv
JOIN form_masters fm ON fm.id=fv.form_master_id AND fm.form_code='TICKET_FORM'
CROSS JOIN (VALUES
 ('Phase 1 - Additional Details','Additional fields completed by Store/Sales during intake.',10),
 ('Phase 2 - Technical Details','Technical review fields completed by HOD/TL/assigned team.',20),
 ('Ticket Core Dropdown Options','Version-specific options for locked Ticket fields.',9999)
) AS v(name,description,display_order)
WHERE fv.is_active=TRUE
  AND NOT EXISTS (SELECT 1 FROM form_sections fs WHERE fs.form_version_id=fv.id AND fs.section_name=v.name);

INSERT INTO form_fields(id,form_section_id,field_key,field_label,field_type,is_required,display_order,is_active,config_json)
SELECT gen_random_uuid(),fs.id,v.field_key,v.label,v.field_type,v.required,v.display_order,TRUE,v.config::jsonb
FROM form_sections fs
JOIN form_versions fv ON fv.id=fs.form_version_id AND fv.is_active=TRUE
JOIN form_masters fm ON fm.id=fv.form_master_id AND fm.form_code='TICKET_FORM'
CROSS JOIN (VALUES
 ('customer_contact','Customer Contact','text',FALSE,1,'{"placeholder":"Contact person / phone"}'),
 ('site_location','Site / Plant Location','text',FALSE,2,'{"placeholder":"Customer site or plant"}'),
 ('serial_number','Serial Number','text',FALSE,3,'{"placeholder":"Equipment serial number"}'),
 ('error_message','Error / Fault Message','textarea',FALSE,4,'{"placeholder":"Fault code or error details"}')
) AS v(field_key,label,field_type,required,display_order,config)
WHERE fs.section_name='Phase 1 - Additional Details'
ON CONFLICT(form_section_id,field_key) DO NOTHING;

INSERT INTO form_fields(id,form_section_id,field_key,field_label,field_type,is_required,display_order,is_active,config_json)
SELECT gen_random_uuid(),fs.id,v.field_key,v.label,v.field_type,v.required,v.display_order,TRUE,v.config::jsonb
FROM form_sections fs
JOIN form_versions fv ON fv.id=fs.form_version_id AND fv.is_active=TRUE
JOIN form_masters fm ON fm.id=fv.form_master_id AND fm.form_code='TICKET_FORM'
CROSS JOIN (VALUES
 ('diagnosis_summary','Diagnosis Summary','textarea',TRUE,1,'{"placeholder":"Technical diagnosis"}'),
 ('repair_action','Repair / Support Action','textarea',TRUE,2,'{"placeholder":"Planned action"}'),
 ('parts_required','Parts Required','textarea',FALSE,3,'{"placeholder":"Replacement parts, if any"}'),
 ('expected_completion','Expected Completion','date',FALSE,4,'{}')
) AS v(field_key,label,field_type,required,display_order,config)
WHERE fs.section_name='Phase 2 - Technical Details'
ON CONFLICT(form_section_id,field_key) DO NOTHING;

INSERT INTO form_fields(id,form_section_id,field_key,field_label,field_type,is_required,display_order,is_active,config_json)
SELECT gen_random_uuid(),fs.id,v.field_key,v.label,'dropdown',FALSE,v.display_order,TRUE,'{}'::jsonb
FROM form_sections fs
JOIN form_versions fv ON fv.id=fs.form_version_id AND fv.is_active=TRUE
JOIN form_masters fm ON fm.id=fv.form_master_id AND fm.form_code='TICKET_FORM'
CROSS JOIN (VALUES
 ('__ticket_core_ticket_type','Ticket Type',1),
 ('__ticket_core_problem_type','Problem Type',2),
 ('__ticket_core_manufacturer','Make / Manufacturer',3),
 ('__ticket_core_received_via','Received Through',4),
 ('__ticket_core_warranty_status','Warranty',5),
 ('__ticket_core_support_mode','Support Location',6),
 ('__ticket_core_support_type','Support Type',7),
 ('__ticket_core_repair_location','Repair Location',8),
 ('__ticket_core_priority','Priority',9)
) AS v(field_key,label,display_order)
WHERE fs.section_name='Ticket Core Dropdown Options'
ON CONFLICT(form_section_id,field_key) DO NOTHING;

INSERT INTO form_field_options(id,form_field_id,option_label,option_value,display_order,is_active)
SELECT gen_random_uuid(),ff.id,v.label,v.label,v.display_order,TRUE
FROM form_fields ff
JOIN form_sections fs ON fs.id=ff.form_section_id
JOIN form_versions fv ON fv.id=fs.form_version_id AND fv.is_active=TRUE
JOIN form_masters fm ON fm.id=fv.form_master_id AND fm.form_code='TICKET_FORM'
JOIN (VALUES
 ('__ticket_core_ticket_type','Hardware',1),('__ticket_core_ticket_type','Software',2),
 ('__ticket_core_problem_type','PLC',1),('__ticket_core_problem_type','HMI',2),('__ticket_core_problem_type','Software',3),('__ticket_core_problem_type','IPC',4),('__ticket_core_problem_type','VFD',5),('__ticket_core_problem_type','Servo',6),
 ('__ticket_core_manufacturer','Siemens',1),('__ticket_core_manufacturer','Rockwell',2),('__ticket_core_manufacturer','ABB',3),('__ticket_core_manufacturer','Yaskawa',4),('__ticket_core_manufacturer','IDEC',5),('__ticket_core_manufacturer','Exor',6),('__ticket_core_manufacturer','Mitsubishi',7),('__ticket_core_manufacturer','Schneider',8),
 ('__ticket_core_received_via','Courier',1),('__ticket_core_received_via','Hand Delivery',2),('__ticket_core_received_via','Customer Site',3),('__ticket_core_received_via','Not Applicable',4),
 ('__ticket_core_warranty_status','Yes',1),('__ticket_core_warranty_status','No',2),('__ticket_core_warranty_status','Confirmation Required',3),
 ('__ticket_core_support_mode','On-site',1),('__ticket_core_support_mode','Remote / Offline',2),('__ticket_core_support_mode','Off-site',3),
 ('__ticket_core_support_type','AMC',1),('__ticket_core_support_type','FOC',2),('__ticket_core_support_type','Chargeable',3),('__ticket_core_support_type','Warranty',4),
 ('__ticket_core_repair_location','In-house / Store',1),('__ticket_core_repair_location','Local Repairer',2),('__ticket_core_repair_location','OEM / Vendor',3),('__ticket_core_repair_location','Customer Site',4),
 ('__ticket_core_priority','Low',1),('__ticket_core_priority','Medium',2),('__ticket_core_priority','High',3),('__ticket_core_priority','Critical',4)
) AS v(field_key,label,display_order) ON v.field_key=ff.field_key
ON CONFLICT(form_field_id,option_value) DO NOTHING;

COMMIT;

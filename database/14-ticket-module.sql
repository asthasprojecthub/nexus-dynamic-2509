-- Apply once after 13-bom-password-notifications.sql on an existing database.
-- Adds the complete Ticket module without modifying Inquiry/Project data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ticket_master_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(60) NOT NULL,
  option_code VARCHAR(80) NOT NULL,
  option_label VARCHAR(160) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_master_options_category_option_code_key UNIQUE(category, option_code)
);
CREATE INDEX IF NOT EXISTS ticket_master_options_category_active_order_idx
  ON ticket_master_options(category,is_active,display_order);

CREATE TABLE IF NOT EXISTS ticket_workflow_statuses (
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
CREATE INDEX IF NOT EXISTS ticket_workflow_statuses_active_sequence_idx
  ON ticket_workflow_statuses(is_active,sequence);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_type VARCHAR(120), manufacturer VARCHAR(120), product VARCHAR(200) NOT NULL,
  complaint_type VARCHAR(120), complaint TEXT NOT NULL,
  priority VARCHAR(40) NOT NULL DEFAULT 'Medium', vendor VARCHAR(160),
  inquiry_id UUID REFERENCES inquiries(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  current_status_id UUID NOT NULL REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  status_entered_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  sla_due_at TIMESTAMPTZ(6), is_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  overdue_notified_at TIMESTAMPTZ(6),
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ(6)
);
CREATE INDEX IF NOT EXISTS tickets_status_overdue_idx ON tickets(current_status_id,is_overdue);
CREATE INDEX IF NOT EXISTS tickets_assignment_idx ON tickets(assigned_user_id,assigned_department_id);
CREATE INDEX IF NOT EXISTS tickets_customer_created_idx ON tickets(customer_id,created_at);

CREATE TABLE IF NOT EXISTS ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status_id UUID REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  to_status_id UUID NOT NULL REFERENCES ticket_workflow_statuses(id) ON DELETE RESTRICT,
  response_data JSONB, note TEXT,
  sla_days_snapshot INTEGER NOT NULL DEFAULT 3,
  sla_due_at TIMESTAMPTZ(6), was_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  changed_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_status_history_ticket_changed_idx
  ON ticket_status_history(ticket_id,changed_at);

CREATE TABLE IF NOT EXISTS ticket_documents (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status_history_id UUID REFERENCES ticket_status_history(id) ON DELETE SET NULL,
  description TEXT, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY(ticket_id,document_id)
);
CREATE INDEX IF NOT EXISTS ticket_documents_status_history_idx ON ticket_documents(status_history_id);

INSERT INTO permissions (id,permission_key,module,action,description,is_active,created_at)
SELECT gen_random_uuid(),v.permission_key,v.module,v.action,v.description,TRUE,NOW()
FROM (VALUES
 ('TICKETS.CREATE','TICKETS','CREATE','Create tickets'),
 ('TICKETS.VIEW','TICKETS','VIEW','View tickets'),
 ('TICKETS.UPDATE','TICKETS','UPDATE','Edit and assign tickets'),
 ('TICKETS.ASSIGN','TICKETS','ASSIGN','Assign tickets'),
 ('TICKETS.STATUS_CHANGE','TICKETS','STATUS_CHANGE','Change ticket status'),
 ('TICKET_MASTER.VIEW','TICKET_MASTER','VIEW','View Ticket Master'),
 ('TICKET_MASTER.CREATE','TICKET_MASTER','CREATE','Create Ticket Master options'),
 ('TICKET_MASTER.UPDATE','TICKET_MASTER','UPDATE','Edit Ticket Master options'),
 ('TICKET_WORKFLOW.VIEW','TICKET_WORKFLOW','VIEW','View Ticket Workflow Master'),
 ('TICKET_WORKFLOW.CREATE','TICKET_WORKFLOW','CREATE','Create ticket workflow status'),
 ('TICKET_WORKFLOW.UPDATE','TICKET_WORKFLOW','UPDATE','Edit ticket workflow status')
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

INSERT INTO ticket_master_options(category,option_code,option_label,display_order) VALUES
 ('PRODUCT_TYPE','PLC','PLC',1),('PRODUCT_TYPE','HMI','HMI / SCADA',2),('PRODUCT_TYPE','VFD','VFD / Drive',3),('PRODUCT_TYPE','PANEL','Control Panel',4),
 ('MANUFACTURER','SIEMENS','Siemens',1),('MANUFACTURER','ABB','ABB',2),('MANUFACTURER','ROCKWELL','Allen-Bradley / Rockwell',3),('MANUFACTURER','SCHNEIDER','Schneider',4),
 ('COMPLAINT_TYPE','HARDWARE','Hardware Failure',1),('COMPLAINT_TYPE','SOFTWARE','Software / Program',2),('COMPLAINT_TYPE','COMMUNICATION','Communication',3),('COMPLAINT_TYPE','QUALITY','Quality / Deviation',4),
 ('PRIORITY','LOW','Low',1),('PRIORITY','MEDIUM','Medium',2),('PRIORITY','HIGH','High',3),('PRIORITY','CRITICAL','Critical',4),
 ('VENDOR','SIEMENS','Siemens',1),('VENDOR','ABB','ABB',2),('VENDOR','ROCKWELL','Rockwell',3),
 ('HOLD_REASON','CUSTOMER_INPUT','Waiting for Customer Input',1),('HOLD_REASON','VENDOR_INPUT','Waiting for Vendor Input',2),('HOLD_REASON','MATERIAL','Material Unavailable',3),
 ('DEVIATION_TYPE','CUSTOMER_DENIED','Customer Denied',1),('DEVIATION_TYPE','VENDOR_DENIED','Vendor Denied',2),('DEVIATION_TYPE','TECHNICAL','Technical Deviation',3),
 ('REPLACEMENT_TYPE','PART_TO_PART','Part-to-Part Replacement',1),('REPLACEMENT_TYPE','UPGRADE','Upgrade / New Model',2),('REPLACEMENT_TYPE','REPAIR','Repair / Support',3),
 ('CLOSURE_TYPE','RESOLVED','Resolved Successfully',1),('CLOSURE_TYPE','REPLACED','Replaced',2),('CLOSURE_TYPE','NO_FAULT','No Fault Found',3),
 ('DISPATCH_TYPE','CUSTOMER','Dispatch to Customer',1),('DISPATCH_TYPE','VENDOR','Dispatch to Vendor',2),('DISPATCH_TYPE','SITE','Dispatch to Site',3)
ON CONFLICT(category,option_code) DO UPDATE SET option_label=EXCLUDED.option_label,is_active=TRUE;

INSERT INTO ticket_workflow_statuses
 (status_code,status_name,status_category,sequence,color,sla_days,popup_required,dynamic_fields,allowed_next_status_codes,allowed_role_codes,notification_rules,escalation_rules)
VALUES
 ('NEW_TECHNICAL_REVIEW','New / Technical Review','NEW',1,'#2563eb',3,TRUE,
  '[{"key":"review_remark","label":"Technical Review","type":"textarea","required":true}]',
  '["UNDER_DIAGNOSIS","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('UNDER_DIAGNOSIS','Under Diagnosis','ACTIVE',2,'#7c3aed',3,TRUE,
  '[{"key":"diagnosis_summary","label":"Diagnosis Summary","type":"textarea","required":true},{"key":"root_cause","label":"Root Cause","type":"textarea","required":false},{"key":"replacement_required","label":"Replacement Required","type":"yesno","required":true}]',
  '["VENDOR_ACKNOWLEDGEMENT","DEVIATION","CUSTOMER_APPROVAL","REPLACEMENT_SUPPORT","HOLD","RESOLVED"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('VENDOR_ACKNOWLEDGEMENT','Vendor Acknowledgement','WAITING',3,'#0891b2',3,TRUE,
  '[{"key":"vendor","label":"Vendor","type":"vendor","required":true},{"key":"acknowledgement_date","label":"Acknowledgement Date","type":"date","required":true},{"key":"reference_no","label":"Vendor Reference","type":"text","required":false}]',
  '["VENDOR_REMARK","DEVIATION","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('VENDOR_REMARK','Vendor Remark','WAITING',4,'#0f766e',3,TRUE,
  '[{"key":"vendor_remark","label":"Vendor Remark","type":"textarea","required":true},{"key":"vendor_document","label":"Vendor Document","type":"file","required":false}]',
  '["CUSTOMER_APPROVAL","DISPATCH_APPROVAL","REPLACEMENT_SUPPORT","DEVIATION","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('DEVIATION','Deviation','WAITING',5,'#dc2626',3,TRUE,
  '[{"key":"deviation_type","label":"Deviation Type","type":"dropdown","required":true,"options":["Customer Denied","Vendor Denied","Technical Deviation"]},{"key":"deviation_detail","label":"Deviation Detail","type":"textarea","required":true},{"key":"proposed_action","label":"Proposed Action","type":"textarea","required":false}]',
  '["CUSTOMER_APPROVAL","REPLACEMENT_SUPPORT","HOLD","RESOLVED"]','["ADMIN","HOD","TL"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('CUSTOMER_APPROVAL','Customer Approval','WAITING',6,'#d97706',3,TRUE,
  '[{"key":"approval_status","label":"Customer Approved","type":"yesno","required":true},{"key":"approval_date","label":"Approval Date","type":"date","required":false,"condition":{"field_key":"approval_status","operator":"equals","value":"Yes"}},{"key":"customer_comment","label":"Customer Comment","type":"textarea","required":false}]',
  '["DISPATCH_APPROVAL","REPLACEMENT_SUPPORT","DEVIATION","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('DISPATCH_APPROVAL','Dispatch Approval','LOGISTICS',7,'#ea580c',3,TRUE,
  '[{"key":"dispatch_type","label":"Dispatch Type","type":"dropdown","required":true,"options":["Dispatch to Customer","Dispatch to Vendor","Dispatch to Site"]},{"key":"approved_by","label":"Approved By","type":"user","required":true},{"key":"dispatch_note","label":"Dispatch Note","type":"textarea","required":false}]',
  '["IN_TRANSIT","HOLD"]','["ADMIN","HOD","TL"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('IN_TRANSIT','In Transit','LOGISTICS',8,'#ca8a04',3,TRUE,
  '[{"key":"docket_no","label":"Docket / Tracking No.","type":"text","required":true},{"key":"expected_delivery","label":"Expected Delivery","type":"date","required":true},{"key":"transit_document","label":"Transit Document","type":"file","required":false}]',
  '["REPLACEMENT_SUPPORT","RESOLVED","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('REPLACEMENT_SUPPORT','Replacement / Support','ACTIVE',9,'#9333ea',3,TRUE,
  '[{"key":"replacement_required","label":"Replacement Required","type":"yesno","required":true},{"key":"replacement_type","label":"Replacement Type","type":"dropdown","required":true,"options":["Part-to-Part Replacement","Upgrade / New Model","Repair / Support"],"condition":{"field_key":"replacement_required","operator":"equals","value":"Yes"}},{"key":"old_part_number","label":"Old Part Number","type":"text","required":true,"condition":{"field_key":"replacement_required","operator":"equals","value":"Yes"}},{"key":"new_part_number","label":"New Part Number","type":"text","required":true,"condition":{"field_key":"replacement_required","operator":"equals","value":"Yes"}},{"key":"customer_approval_required","label":"Customer Approval Required","type":"yesno","required":true,"condition":{"field_key":"replacement_required","operator":"equals","value":"Yes"}},{"key":"expected_delivery","label":"Expected Delivery","type":"date","required":true,"condition":{"field_key":"replacement_required","operator":"equals","value":"Yes"}}]',
  '["RESOLVED","HOLD"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('HOLD','Hold','HOLD',10,'#64748b',3,TRUE,
  '[{"key":"hold_reason","label":"Hold Reason","type":"dropdown","required":true,"options":["Waiting for Customer Input","Waiting for Vendor Input","Material Unavailable"]},{"key":"hold_remark","label":"Hold Remark","type":"textarea","required":true},{"key":"expected_resume","label":"Expected Resume Date","type":"date","required":false}]',
  '["UNDER_DIAGNOSIS","VENDOR_ACKNOWLEDGEMENT","CUSTOMER_APPROVAL","REPLACEMENT_SUPPORT","RESOLVED"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('RESOLVED','Resolved','RESOLVED',11,'#16a34a',3,TRUE,
  '[{"key":"resolution_summary","label":"Resolution Summary","type":"textarea","required":true},{"key":"closure_type","label":"Closure Type","type":"dropdown","required":true,"options":["Resolved Successfully","Replaced","No Fault Found"]},{"key":"resolution_document","label":"Resolution Document","type":"file","required":false}]',
  '["CLOSED","UNDER_DIAGNOSIS"]','["ADMIN","HOD","TL","EMPLOYEE"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"assignee":true,"roles":["TL","HOD","ADMIN"]}'),
 ('CLOSED','Closed','CLOSED',12,'#15803d',0,TRUE,
  '[{"key":"closure_type","label":"Closure Type","type":"dropdown","required":true,"options":["Resolved Successfully","Replaced","No Fault Found"]},{"key":"customer_confirmation","label":"Customer Confirmation Received","type":"yesno","required":true},{"key":"closure_remark","label":"Closure Remark","type":"textarea","required":false}]',
  '[]','["ADMIN","HOD","TL"]','{"assignee":true,"creator":true,"roles":["ADMIN"]}','{"roles":["ADMIN"]}')
ON CONFLICT(status_code) DO UPDATE SET
 status_name=EXCLUDED.status_name,status_category=EXCLUDED.status_category,sequence=EXCLUDED.sequence,
 color=EXCLUDED.color,sla_days=EXCLUDED.sla_days,popup_required=EXCLUDED.popup_required,
 dynamic_fields=EXCLUDED.dynamic_fields,allowed_next_status_codes=EXCLUDED.allowed_next_status_codes,
 allowed_role_codes=EXCLUDED.allowed_role_codes,notification_rules=EXCLUDED.notification_rules,
 escalation_rules=EXCLUDED.escalation_rules,is_active=TRUE,updated_at=NOW();

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function createVersion(formMasterId, name, sections) {
  return prisma.formVersion.create({
    data: {
      formMasterId, versionNo: 1, versionName: name, isActive: true,
      sections: { create: sections.map((s, si) => ({
        sectionName: s.title, description: s.description || null, displayOrder: si + 1,
        fields: { create: s.fields.map((f, fi) => ({
          fieldKey: f.key || slug(f.label), fieldLabel: f.label, fieldType: f.type, isRequired: !!f.required,
          displayOrder: fi + 1, configJson: f.table_config ? { table_config: f.table_config } : undefined,
          options: f.options?.length ? { create: f.options.map((o, oi) => ({ optionLabel: o, optionValue: o, displayOrder: oi + 1 })) } : undefined,
        })) },
      })) },
    }, include: { sections: { include: { fields: true } } },
  });
}

async function main() {
  await prisma.timesheetTask.deleteMany();
  await prisma.notificationRecipient.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.ticketDocument.deleteMany();
  await prisma.ticketWorkSession.deleteMany();
  await prisma.ticketAssignment.deleteMany();
  await prisma.ticketStatusHistory.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.ticketWorkflowStatus.deleteMany();
  await prisma.meetingUser.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.planningTaskNote.deleteMany();
  await prisma.projectPlanning.deleteMany();
  await prisma.projectPanelFieldValue.deleteMany();
  await prisma.projectFieldValue.deleteMany();
  await prisma.projectPanel.deleteMany();
  await prisma.projectDepartment.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.project.deleteMany();
  await prisma.inquiryPanelFieldValue.deleteMany();
  await prisma.inquiryFieldValue.deleteMany();
  await prisma.inquiryDocument.deleteMany();
  await prisma.inquiryPanel.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentType.deleteMany();
  await prisma.planningTaskMaster.deleteMany();
  await prisma.panelMaster.deleteMany();
  await prisma.formFieldOption.deleteMany();
  await prisma.formField.deleteMany();
  await prisma.formSection.deleteMany();
  await prisma.formVersion.deleteMany();
  await prisma.formMaster.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.customerDepartment.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userDepartment.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.inquiryStatusMaster.deleteMany();
  await prisma.role.deleteMany();

  const roles = {};
  for (const [code, name] of [['ADMIN','Admin'],['HOD','HOD'],['TL','Team Lead'],['EMPLOYEE','Employee']]) {
    roles[code] = await prisma.role.create({ data: { roleCode: code, roleName: name } });
  }
  const accessPages = [
    ['DASHBOARD',['VIEW']],
    ['INQUIRIES',['CREATE','VIEW','UPDATE','FOLLOW_UP','COMMERCIAL_SUBMIT','STATUS_CHANGE','KICKOFF','CONVERT_TO_PROJECT']],
    ['PROJECTS',['CREATE','VIEW','UPDATE','PLANNING_GRID','DUPLICATE_PLANNING_GRID','UPDATE_COMPLETION','MARK_COMPLETED','UPLOAD_DOCUMENTS']],
    ['TICKETS',['CREATE','VIEW','UPDATE','ASSIGN','STATUS_CHANGE']],
    ['TICKET_MASTER',['VIEW','CREATE','UPDATE']],
    ['TICKET_WORKFLOW',['VIEW','CREATE','UPDATE']],
    ['CUSTOMERS',['CREATE','VIEW','UPDATE']],
    ['NOTIFICATIONS',['VIEW','SEND']],
    ['TIMESHEET',['CREATE','VIEW','UPDATE','TEAM_VIEW','ASSIGN','APPROVE']],
    ['TIMESHEET_MASTER',['VIEW','CREATE','UPDATE','ASSIGN','DELETE']],
    ['INQUIRY_MASTER',['VIEW','CREATE','UPDATE']],
    ['PANEL_MASTER',['VIEW','CREATE','UPDATE']],
    ['PROJECT_MASTER',['VIEW','CREATE','UPDATE']],
    ['PLANNING_GRID_MASTER',['VIEW','CREATE','UPDATE','DELETE']],
    ['DEPARTMENTS',['VIEW','CREATE','UPDATE']],
    ['DOCUMENT_TYPES',['VIEW','CREATE','UPDATE']],
    ['USERS',['VIEW','CREATE','UPDATE','MANAGE_ACCESS','RESET_PASSWORD']],
    ['AUDIT_LOGS',['VIEW']],
  ];
  const permissionByKey = new Map();
  for (const [module, actions] of accessPages) for (const action of actions) {
    const permissionKey=`${module}.${action}`;
    const p = await prisma.permission.create({ data: { permissionKey, module, action } });
    permissionByKey.set(permissionKey,p);
  }
  const defaults = {
    ADMIN:[...permissionByKey.keys()],
    HOD:[
      'DASHBOARD.VIEW',
      'CUSTOMERS.VIEW','CUSTOMERS.CREATE','CUSTOMERS.UPDATE',
      'INQUIRIES.VIEW','INQUIRIES.CREATE','INQUIRIES.UPDATE','INQUIRIES.STATUS_CHANGE','INQUIRIES.FOLLOW_UP','INQUIRIES.COMMERCIAL_SUBMIT','INQUIRIES.KICKOFF','INQUIRIES.CONVERT_TO_PROJECT',
      'PROJECTS.VIEW','PROJECTS.CREATE','PROJECTS.UPDATE','PROJECTS.PLANNING_GRID','PROJECTS.DUPLICATE_PLANNING_GRID','PROJECTS.UPDATE_COMPLETION','PROJECTS.MARK_COMPLETED',
      'TICKETS.CREATE','TICKETS.VIEW','TICKETS.UPDATE','TICKETS.ASSIGN','TICKETS.STATUS_CHANGE','TICKET_MASTER.VIEW','TICKET_WORKFLOW.VIEW',
      'TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.ASSIGN','TIMESHEET.TEAM_VIEW','TIMESHEET.APPROVE',
      'TIMESHEET_MASTER.VIEW','TIMESHEET_MASTER.CREATE','TIMESHEET_MASTER.UPDATE','TIMESHEET_MASTER.ASSIGN',
      'INQUIRY_MASTER.VIEW','PANEL_MASTER.VIEW','PROJECT_MASTER.VIEW','PLANNING_GRID_MASTER.VIEW','DEPARTMENTS.VIEW','DOCUMENT_TYPES.VIEW',
    ],
    TL:[
      'DASHBOARD.VIEW','CUSTOMERS.VIEW',
      'INQUIRIES.VIEW','INQUIRIES.CREATE','INQUIRIES.UPDATE','INQUIRIES.STATUS_CHANGE','INQUIRIES.FOLLOW_UP','INQUIRIES.KICKOFF',
      'PROJECTS.VIEW','PROJECTS.CREATE','PROJECTS.UPDATE','PROJECTS.PLANNING_GRID','PROJECTS.DUPLICATE_PLANNING_GRID','PROJECTS.UPDATE_COMPLETION',
      'TICKETS.CREATE','TICKETS.VIEW','TICKETS.UPDATE','TICKETS.ASSIGN','TICKETS.STATUS_CHANGE','TICKET_MASTER.VIEW','TICKET_WORKFLOW.VIEW',
      'TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.ASSIGN','TIMESHEET.TEAM_VIEW',
    ],
    EMPLOYEE:[
      'DASHBOARD.VIEW','CUSTOMERS.VIEW','INQUIRIES.VIEW','PROJECTS.VIEW','PROJECTS.UPDATE_COMPLETION',
      'TICKETS.CREATE','TICKETS.VIEW','TICKETS.STATUS_CHANGE',
      'TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.TEAM_VIEW',
    ],
  };
  for (const [roleCode, keys] of Object.entries(defaults)) {
    await prisma.rolePermission.createMany({data:keys.map((key)=>({roleId:roles[roleCode].id,permissionId:permissionByKey.get(key).id})),skipDuplicates:true});
  }

  const inquiryStatuses = [
    ['NEW','New','STANDARD',false,[]],
    ['TECH_EVAL','Technical Evaluation','STANDARD',false,[]],
    ['TECH_BOM','Technical BoM Submitted','STANDARD',true,[]],
    ['BOM_APPROVAL','BoM Approval Pending','STANDARD',true,[]],
    ['REVISION','Revision','STANDARD',true,[]],
    ['COMM_BOM','Commercial BOM Submission','STANDARD',true,[]],
    ['ORDER_WON','Order Won','STANDARD',true,[]],
    ['ORDER_LOST','Order Lost','REASON',true,['Price','Commercial','Priority','Timing','Trust Issue','Certification']],
    ['INQUIRY_HOLD','Inquiry Hold','REASON',true,['Due to Customer','Specification','Technical','Commercial']],
  ];
  for (let index=0;index<inquiryStatuses.length;index+=1) {
    const [statusCode,statusName,behavior,requiresPopup,reasonOptions]=inquiryStatuses[index];
    await prisma.inquiryStatusMaster.create({data:{statusCode,statusName,behavior,requiresPopup,reasonOptions,displayOrder:index+1}});
  }

  const ticketMasterSeed = {
    PRODUCT_TYPE:['PLC','HMI / SCADA','VFD / Drive','Control Panel'],
    MANUFACTURER:['Siemens','ABB','Allen-Bradley / Rockwell','Schneider'],
    COMPLAINT_TYPE:['Hardware Failure','Software / Program','Communication','Quality / Deviation'],
    PRIORITY:['Low','Medium','High','Critical'], VENDOR:['Siemens','ABB','Rockwell'],
    HOLD_REASON:['Waiting for Customer Input','Waiting for Vendor Input','Material Unavailable'],
    DEVIATION_TYPE:['Customer Denied','Vendor Denied','Technical Deviation'],
    REPLACEMENT_TYPE:['Part-to-Part Replacement','Upgrade / New Model','Repair / Support'],
    CLOSURE_TYPE:['Resolved Successfully','Replaced','No Fault Found'],
    DISPATCH_TYPE:['Dispatch to Customer','Dispatch to Vendor','Dispatch to Site'],
  };
  const defaultNotify={assignee:true,creator:true,roles:['ADMIN']};
  const defaultEscalate={assignee:true,roles:['TL','HOD','ADMIN']};
  const allTicketRoles=['ADMIN','HOD','TL','EMPLOYEE'];
  const ticketWorkflowSeed = [
    {code:'NEW_TECHNICAL_REVIEW',name:'New / Technical Review',category:'NEW',color:'#2563eb',fields:[{key:'review_remark',label:'Technical Review',type:'textarea',required:true}],next:['UNDER_DIAGNOSIS','HOLD']},
    {code:'UNDER_DIAGNOSIS',name:'Under Diagnosis',category:'ACTIVE',color:'#7c3aed',fields:[{key:'diagnosis_summary',label:'Diagnosis Summary',type:'textarea',required:true},{key:'root_cause',label:'Root Cause',type:'textarea',required:false},{key:'replacement_required',label:'Replacement Required',type:'yesno',required:true}],next:['VENDOR_ACKNOWLEDGEMENT','DEVIATION','CUSTOMER_APPROVAL','REPLACEMENT_SUPPORT','HOLD','RESOLVED']},
    {code:'VENDOR_ACKNOWLEDGEMENT',name:'Vendor Acknowledgement',category:'WAITING',color:'#0891b2',fields:[{key:'vendor',label:'Vendor',type:'vendor',required:true},{key:'acknowledgement_date',label:'Acknowledgement Date',type:'date',required:true},{key:'reference_no',label:'Vendor Reference',type:'text',required:false}],next:['VENDOR_REMARK','DEVIATION','HOLD']},
    {code:'VENDOR_REMARK',name:'Vendor Remark',category:'WAITING',color:'#0f766e',fields:[{key:'vendor_remark',label:'Vendor Remark',type:'textarea',required:true},{key:'vendor_document',label:'Vendor Document',type:'file',required:false}],next:['CUSTOMER_APPROVAL','DISPATCH_APPROVAL','REPLACEMENT_SUPPORT','DEVIATION','HOLD']},
    {code:'DEVIATION',name:'Deviation',category:'WAITING',color:'#dc2626',roles:['ADMIN','HOD','TL'],fields:[{key:'deviation_type',label:'Deviation Type',type:'dropdown',required:true,options:ticketMasterSeed.DEVIATION_TYPE},{key:'deviation_detail',label:'Deviation Detail',type:'textarea',required:true},{key:'proposed_action',label:'Proposed Action',type:'textarea',required:false}],next:['CUSTOMER_APPROVAL','REPLACEMENT_SUPPORT','HOLD','RESOLVED']},
    {code:'CUSTOMER_APPROVAL',name:'Customer Approval',category:'WAITING',color:'#d97706',fields:[{key:'approval_status',label:'Customer Approved',type:'yesno',required:true},{key:'approval_date',label:'Approval Date',type:'date',required:false,condition:{field_key:'approval_status',operator:'equals',value:'Yes'}},{key:'customer_comment',label:'Customer Comment',type:'textarea',required:false}],next:['DISPATCH_APPROVAL','REPLACEMENT_SUPPORT','DEVIATION','HOLD']},
    {code:'DISPATCH_APPROVAL',name:'Dispatch Approval',category:'LOGISTICS',color:'#ea580c',roles:['ADMIN','HOD','TL'],fields:[{key:'dispatch_type',label:'Dispatch Type',type:'dropdown',required:true,options:ticketMasterSeed.DISPATCH_TYPE},{key:'approved_by',label:'Approved By',type:'user',required:true},{key:'dispatch_note',label:'Dispatch Note',type:'textarea',required:false}],next:['IN_TRANSIT','HOLD']},
    {code:'IN_TRANSIT',name:'In Transit',category:'LOGISTICS',color:'#ca8a04',fields:[{key:'docket_no',label:'Docket / Tracking No.',type:'text',required:true},{key:'expected_delivery',label:'Expected Delivery',type:'date',required:true},{key:'transit_document',label:'Transit Document',type:'file',required:false}],next:['REPLACEMENT_SUPPORT','RESOLVED','HOLD']},
    {code:'REPLACEMENT_SUPPORT',name:'Replacement / Support',category:'ACTIVE',color:'#9333ea',fields:[{key:'replacement_required',label:'Replacement Required',type:'yesno',required:true},{key:'replacement_type',label:'Replacement Type',type:'dropdown',required:true,options:ticketMasterSeed.REPLACEMENT_TYPE,condition:{field_key:'replacement_required',operator:'equals',value:'Yes'}},{key:'old_part_number',label:'Old Part Number',type:'text',required:true,condition:{field_key:'replacement_required',operator:'equals',value:'Yes'}},{key:'new_part_number',label:'New Part Number',type:'text',required:true,condition:{field_key:'replacement_required',operator:'equals',value:'Yes'}},{key:'customer_approval_required',label:'Customer Approval Required',type:'yesno',required:true,condition:{field_key:'replacement_required',operator:'equals',value:'Yes'}},{key:'expected_delivery',label:'Expected Delivery',type:'date',required:true,condition:{field_key:'replacement_required',operator:'equals',value:'Yes'}}],next:['RESOLVED','HOLD']},
    {code:'HOLD',name:'Hold',category:'HOLD',color:'#64748b',fields:[{key:'hold_reason',label:'Hold Reason',type:'dropdown',required:true,options:ticketMasterSeed.HOLD_REASON},{key:'hold_remark',label:'Hold Remark',type:'textarea',required:true},{key:'expected_resume',label:'Expected Resume Date',type:'date',required:false}],next:['UNDER_DIAGNOSIS','VENDOR_ACKNOWLEDGEMENT','CUSTOMER_APPROVAL','REPLACEMENT_SUPPORT','RESOLVED']},
    {code:'RESOLVED',name:'Resolved',category:'RESOLVED',color:'#16a34a',fields:[{key:'resolution_summary',label:'Resolution Summary',type:'textarea',required:true},{key:'closure_type',label:'Closure Type',type:'dropdown',required:true,options:ticketMasterSeed.CLOSURE_TYPE},{key:'resolution_document',label:'Resolution Document',type:'file',required:false}],next:['CLOSED','UNDER_DIAGNOSIS']},
    {code:'CLOSED',name:'Closed',category:'CLOSED',color:'#15803d',sla:0,roles:['ADMIN','HOD','TL'],fields:[{key:'closure_type',label:'Closure Type',type:'dropdown',required:true,options:ticketMasterSeed.CLOSURE_TYPE},{key:'customer_confirmation',label:'Customer Confirmation Received',type:'yesno',required:true},{key:'closure_remark',label:'Closure Remark',type:'textarea',required:false}],next:[]},
  ];
  const ticketStatuses={};
  for(let index=0;index<ticketWorkflowSeed.length;index+=1){
    const item=ticketWorkflowSeed[index];
    ticketStatuses[item.code]=await prisma.ticketWorkflowStatus.create({data:{statusCode:item.code,statusName:item.name,statusCategory:item.category,sequence:index+1,color:item.color,slaDays:item.sla??3,popupRequired:true,dynamicFields:item.fields,allowedNextStatusCodes:item.next,allowedRoleCodes:item.roles||allTicketRoles,allowedDepartmentIds:[],notificationRules:defaultNotify,escalationRules:defaultEscalate}});
  }

  const depts = {};
  for (const [code, name] of [['AUT','Automation'],['DES','Design'],['PUR','Purchase'],['PRO','Production'],['QC','QC'],['STO','Store'],['SAL','Sales']]) {
    depts[name] = await prisma.department.create({ data: { departmentCode: code, departmentName: name } });
  }

  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.create({ data: { employeeNo: 'EMP-0001', fullName: 'Nexus Admin', email: 'admin@nexus.local', passwordHash, roleId: roles.ADMIN.id } });
  const meera = await prisma.user.create({ data: { employeeNo: 'EMP-0002', fullName: 'Meera Shah', email: 'meera@nexus.local', passwordHash, roleId: roles.HOD.id } });
  const aarav = await prisma.user.create({ data: { employeeNo: 'EMP-0003', fullName: 'Aarav Shah', email: 'aarav@nexus.local', passwordHash, roleId: roles.TL.id } });
  const diya = await prisma.user.create({ data: { employeeNo: 'EMP-0004', fullName: 'Diya Patel', email: 'diya@nexus.local', passwordHash, roleId: roles.EMPLOYEE.id } });
  const kabir = await prisma.user.create({ data: { employeeNo: 'EMP-0005', fullName: 'Kabir Joshi', email: 'kabir@nexus.local', passwordHash, roleId: roles.EMPLOYEE.id } });
  await prisma.userDepartment.createMany({ data: [
    { userId: meera.id, departmentId: depts.Design.id, roleId: roles.HOD.id, isPrimary: true },
    { userId: meera.id, departmentId: depts.Automation.id, roleId: roles.HOD.id, isPrimary: false },
    { userId: aarav.id, departmentId: depts.Design.id, roleId: roles.TL.id, isPrimary: true },
    { userId: diya.id, departmentId: depts.Automation.id, roleId: roles.EMPLOYEE.id, isPrimary: true },
    { userId: kabir.id, departmentId: depts.Production.id, roleId: roles.EMPLOYEE.id, isPrimary: true },
  ]});

  const c1 = await prisma.customer.create({ data: { customerNo: 'CUS-0001', customerName: 'Apex Process Systems', customerType: 'OEM' } });
  const c2 = await prisma.customer.create({ data: { customerNo: 'CUS-0002', customerName: 'Sterling Pharma Engineering', customerType: 'End User' } });
  const c1p = await prisma.customerDepartment.create({ data: { customerId: c1.id, departmentName: 'Projects', departmentCode: 'PRJ' } });
  const c1u = await prisma.customerDepartment.create({ data: { customerId: c1.id, departmentName: 'Purchase', departmentCode: 'PUR' } });
  const c2e = await prisma.customerDepartment.create({ data: { customerId: c2.id, departmentName: 'Engineering', departmentCode: 'ENG' } });
  await prisma.customerContact.createMany({ data: [
    { customerDepartmentId: c1p.id, contactName: 'Raj Mehta', designation: 'Project Manager', stakeholderRole: 'Decision Maker', email: 'raj@apex.example', phone: '9876510001', isPrimary: true },
    { customerDepartmentId: c1u.id, contactName: 'Nina Shah', designation: 'Purchase Engineer', stakeholderRole: 'Commercial', email: 'nina@apex.example', phone: '9876510002' },
    { customerDepartmentId: c2e.id, contactName: 'Mihir Desai', designation: 'Automation Lead', stakeholderRole: 'Technical Evaluator', email: 'mihir@sterling.example', phone: '9876520001', isPrimary: true },
  ]});

  const inquiryForm = await prisma.formMaster.create({ data: { formCode: 'INQUIRY_GENERAL', formName: 'Inquiry General Information Form', formType: 'INQUIRY' } });
  await createVersion(inquiryForm.id, 'Inquiry General Information Form', [{ title: 'General Inquiry Information', fields: [
    { label:'Order Expected End Date', type:'date', required:true },
    { label:'Panel Area Classification', type:'dropdown', required:true, options:['Non Hazardous','Zone 1','Zone 2','Not Applicable'] },
    { label:'Installation Type', type:'dropdown', required:true, options:['Indoor','Outdoor','Not Applicable'] },
    { label:'IP Rating', type:'dropdown', required:true, options:['IP42','IP54','IP55','IP65','IP66','Not Applicable'] },
    { label:'Enclosure Type', type:'dropdown', required:true, options:['CRCA / MS','SS304','SS316','FLP','Not Applicable'] },
    { label:'Enclosure Make', type:'text' }, { label:'Panel Structure', type:'dropdown', options:['Floor Mounted','Wall Mounted','Desk Type','Not Applicable'] },
    { label:'Cable Entry', type:'dropdown', options:['Top','Bottom','Top & Bottom','Not Applicable'] }, { label:'Switchgear Make', type:'text' },
    { label:'Application / Process', type:'text' }, { label:'Supply Voltage', type:'text' }, { label:'Control Voltage', type:'text' },
  ]}]);

  const projectForm = await prisma.formMaster.create({ data: { formCode: 'PROJECT_GENERAL', formName: 'Project Information Form', formType: 'PROJECT' } });
  await createVersion(projectForm.id, 'Project Information Form', [{ title:'Project Information', fields:[
    { label:'Project Quantity', type:'number', required:true }, { label:'Project Type', type:'dropdown', options:['New','Modification','AMC','Retrofit'] },
    { label:'Priority', type:'radio', options:['Low','Medium','High','Critical'] }, { label:'Remarks', type:'textarea' },
  ]}]);

  const ticketForm = await prisma.formMaster.create({ data: { formCode:'TICKET_FORM', formName:'Ticket Form', formType:'TICKET' } });
  const ticketFormVersion = await createVersion(ticketForm.id, 'Ticket Form Version 1', [
    {title:'Phase 1 Additional Details',fields:[
      {label:'Serial Number',type:'text'},{label:'Site / Machine',type:'text'},{label:'Contact Person',type:'text'},{label:'Contact Number',type:'text'},
    ]},
    {title:'Phase 2 Technical Details',fields:[
      {label:'Diagnosis Summary',type:'textarea',required:true},{label:'Repair Action',type:'textarea'},{label:'Parts Required',type:'textarea'},{label:'Expected Completion',type:'date'},
    ]},
    {title:'Ticket Core Dropdown Options',fields:[
      {key:'__ticket_core_ticket_type',label:'Ticket Type',type:'dropdown',options:['Hardware','Software']},
      {key:'__ticket_core_problem_type',label:'Problem Type',type:'dropdown',options:['PLC','HMI','Software','Programming','IPC','VFD','Servo']},
      {key:'__ticket_core_manufacturer',label:'Make / Manufacturer',type:'dropdown',options:['Rockwell','ABB','Yaskawa','IDEC','Exor','Siemens','Mitsubishi','Schneider']},
      {key:'__ticket_core_received_via',label:'Received Through',type:'dropdown',options:['Courier','Hand Delivery','Customer Site','Not Applicable']},
      {key:'__ticket_core_warranty_status',label:'Warranty',type:'dropdown',options:['Yes','No','Confirmation Required']},
      {key:'__ticket_core_support_mode',label:'Support Location',type:'dropdown',options:['On-site','Remote / Offline','Off-site']},
      {key:'__ticket_core_support_type',label:'Support Type',type:'dropdown',options:['AMC','FOC','Chargeable','Warranty']},
      {key:'__ticket_core_repair_location',label:'Repair Location',type:'dropdown',options:['In-house / Store','Local Repairer','OEM / Vendor','Customer Site']},
      {key:'__ticket_core_priority',label:'Priority',type:'dropdown',options:['Low','Medium','High','Critical']},
    ]},
  ]);

  const panelDefs = [
    ['PLC-STD','PLC Panel',[{ title:'PLC Panel – Technical Details', fields:[
      {label:'IP Rating',type:'dropdown',required:true,options:['IP54','IP55','IP65','IP66']},{label:'Enclosure Type',type:'text',required:true},
      {label:'PLC Make',type:'dropdown',required:true,options:['Siemens','Allen Bradley','Mitsubishi','Delta','Schneider']},{label:'PLC Model',type:'text'},{label:'I/O Count',type:'number'}
    ]}]],
    ['MCC-STD','MCC Panel',[{ title:'MCC Panel Configuration', fields:[
      {label:'Form Type',type:'radio',required:true,options:['Non Compartmental','Form 2b','Form 3b','Form 4b']},{label:'Incomer Type',type:'dropdown',required:true,options:['MCCB','ACB','Fuse Switch']},
      {label:'Busbar Material',type:'radio',required:true,options:['Copper','Aluminium']},{label:'Protection Relay',type:'checkbox',options:['Over Current','Earth Fault','Under Voltage','Over Voltage']}
    ]}]],
    ['VFD-STD','VFD Panel',[{ title:'VFD Panel Configuration', fields:[
      {label:'Drive Make',type:'dropdown',required:true,options:['ABB','Siemens','Danfoss','Yaskawa','Schneider']},{label:'Drive Rating',type:'text',required:true},{label:'Bypass',type:'radio',options:['Yes','No']},{label:'Cooling',type:'dropdown',options:['Natural','Forced Ventilation','Air Conditioned']}
    ]}]],
    ['FLP-STD','FLP Panel',[{ title:'FLP Panel Configuration', fields:[
      {label:'Hazardous Area',type:'dropdown',required:true,options:['Zone 1','Zone 2']},{label:'Certification',type:'text',required:true},{label:'Gas Group',type:'text'}
    ]}]],
  ];
  const panels = {};
  for (const [code,type,sections] of panelDefs) {
    const fm = await prisma.formMaster.create({ data: { formCode:`PANEL_${code}`, formName:`${type} Form`, formType:'PANEL' } });
    const fv = await createVersion(fm.id, `${type} Technical Form`, sections);
    panels[code] = { master: await prisma.panelMaster.create({ data:{ panelCode:code, panelType:type, formMasterId:fm.id } }), version: fv };
  }

  const tasks = {
    Automation:['System Architecture Definition','Control Architecture Definition','Software Architecture Definition','PLC Programming','HMI / SCADA Development'],
    Design:['GA Drawing','Power Diagram','Control Wiring'], Purchase:['BOM Review','Material Purchase'], Production:['Panel Fabrication','Assembly','Testing'],
    QC:['Inspection','FAT Support'], Store:['Material Receiving','Material Issue']
  };
  for (const [department, names] of Object.entries(tasks)) for (let i=0;i<names.length;i++) {
    await prisma.planningTaskMaster.create({ data:{ departmentId: depts[department].id, taskName:names[i], displayOrder:i+1 } });
  }

  const i1 = await prisma.inquiry.create({ data:{ inquiryNo:'INQ-2026-0142', customerId:c1.id, projectName:'Reactor Automation Upgrade', status:'Technical Evaluation', qty:3, createdById:admin.id } });
  const i2 = await prisma.inquiry.create({ data:{ inquiryNo:'INQ-2026-0141', customerId:c2.id, projectName:'Utility VFD Control Panel', status:'New', qty:3, createdById:admin.id } });
  const i3 = await prisma.inquiry.create({ data:{ inquiryNo:'INQ-2026-0138', customerId:c1.id, projectName:'Packaging Line Control Panel', status:'Order Won', qty:1, createdById:admin.id } });
  const ip11 = await prisma.inquiryPanel.create({ data:{ inquiryId:i1.id,panelMasterId:panels['PLC-STD'].master.id,formVersionId:panels['PLC-STD'].version.id,panelNo:'P-01',quantity:2 } });
  await prisma.inquiryPanel.create({ data:{ inquiryId:i1.id,panelMasterId:panels['MCC-STD'].master.id,formVersionId:panels['MCC-STD'].version.id,panelNo:'P-02',quantity:1 } });
  await prisma.inquiryPanel.create({ data:{ inquiryId:i2.id,panelMasterId:panels['VFD-STD'].master.id,formVersionId:panels['VFD-STD'].version.id,panelNo:'P-01',quantity:3 } });
  await prisma.inquiryPanel.create({ data:{ inquiryId:i3.id,panelMasterId:panels['PLC-STD'].master.id,formVersionId:panels['PLC-STD'].version.id,panelNo:'P-01',quantity:1 } });

  const pr1 = await prisma.project.create({ data:{ projectNo:'PRJ-2026-0088', inquiryId:i3.id, customerId:c1.id, projectName:'Packaging Line Control Panel', status:'In Progress', progress:63, createdById:admin.id } });
  const pr2 = await prisma.project.create({ data:{ projectNo:'PRJ-2026-0083', customerId:c2.id, projectName:'Process MCC Expansion', status:'Planning', progress:25, createdById:admin.id } });
  const ticketNow=new Date();
  const ticketDue=new Date(ticketNow.getTime()+(3*86400000));
  const ticket1=await prisma.ticket.create({data:{ticketNo:'TKT-2026-00001',subject:'Intermittent HMI display issue',customerId:c1.id,ticketType:'Hardware',problemType:'HMI',manufacturer:'Siemens',modelNumber:'Comfort HMI TP1200',receivedVia:'Courier',warrantyStatus:'Confirmation Required',supportMode:'Off-site',supportType:'Chargeable',complaint:'Display is intermittently blank after power cycle.',priority:'High',inquiryId:i1.id,projectId:pr1.id,formVersionId:ticketFormVersion.id,currentPhase:2,phase1Data:{serial_number:'HMI-1200-01'},phase1SubmittedAt:ticketNow,repairLocation:'In-house / Store',phase2Data:{diagnosis_summary:'Power supply and display connector are under inspection.'},phase2SubmittedAt:ticketNow,currentStatusId:ticketStatuses.UNDER_DIAGNOSIS.id,statusEnteredAt:ticketNow,slaDueAt:ticketDue,createdById:admin.id,createdDepartmentId:depts.Store.id}});
  await prisma.ticketAssignment.create({data:{ticketId:ticket1.id,userId:aarav.id,departmentId:depts.Design.id,assignedById:admin.id}});
  await prisma.ticketStatusHistory.createMany({data:[
    {ticketId:ticket1.id,toStatusId:ticketStatuses.NEW_TECHNICAL_REVIEW.id,responseData:{created:true},slaDaysSnapshot:3,slaDueAt:ticketDue,changedById:admin.id,changedAt:new Date(ticketNow.getTime()-3600000)},
    {ticketId:ticket1.id,fromStatusId:ticketStatuses.NEW_TECHNICAL_REVIEW.id,toStatusId:ticketStatuses.UNDER_DIAGNOSIS.id,responseData:{diagnosis_summary:'Power supply and display connector are under inspection.',replacement_required:'No'},slaDaysSnapshot:3,slaDueAt:ticketDue,changedById:aarav.id},
  ]});
  const ticket2=await prisma.ticket.create({data:{ticketNo:'TKT-2026-00002',subject:'VFD communication drops',customerId:c2.id,ticketType:'Hardware',problemType:'VFD',manufacturer:'ABB',modelNumber:'ACS580',receivedVia:'Customer Site',warrantyStatus:'No',supportMode:'On-site',supportType:'AMC',complaint:'Drive communication drops intermittently on Modbus TCP.',priority:'Medium',formVersionId:ticketFormVersion.id,currentPhase:1,phase1Data:{},phase1SubmittedAt:ticketNow,currentStatusId:ticketStatuses.NEW_TECHNICAL_REVIEW.id,statusEnteredAt:ticketNow,slaDueAt:ticketDue,createdById:admin.id,createdDepartmentId:depts.Sales.id}});
  await prisma.ticketAssignment.create({data:{ticketId:ticket2.id,departmentId:depts.Automation.id,assignedById:admin.id}});
  await prisma.ticketStatusHistory.create({data:{ticketId:ticket2.id,toStatusId:ticketStatuses.NEW_TECHNICAL_REVIEW.id,responseData:{created:true},slaDaysSnapshot:3,slaDueAt:ticketDue,changedById:admin.id}});
  const pp1 = await prisma.projectPanel.create({ data:{ projectId:pr1.id,panelMasterId:panels['PLC-STD'].master.id,formVersionId:panels['PLC-STD'].version.id,panelNo:'P-01',quantity:1 } });
  const pp2 = await prisma.projectPanel.create({ data:{ projectId:pr2.id,panelMasterId:panels['MCC-STD'].master.id,formVersionId:panels['MCC-STD'].version.id,panelNo:'P-01',quantity:1 } });
  const pp3 = await prisma.projectPanel.create({ data:{ projectId:pr2.id,panelMasterId:panels['VFD-STD'].master.id,formVersionId:panels['VFD-STD'].version.id,panelNo:'P-02',quantity:2 } });
  await prisma.projectDepartment.createMany({ data:[
    {projectId:pr1.id,departmentId:depts.Automation.id},{projectId:pr1.id,departmentId:depts.Design.id},{projectId:pr1.id,departmentId:depts.Purchase.id},{projectId:pr1.id,departmentId:depts.Production.id},
    {projectId:pr2.id,departmentId:depts.Design.id},{projectId:pr2.id,departmentId:depts.Purchase.id},
  ]});
  await prisma.projectPlanning.createMany({ data:[
    {projectId:pr1.id,projectPanelId:pp1.id,departmentId:depts.Design.id,taskName:'Electrical drawing preparation',assignedUserId:aarav.id,plannedStart:new Date('2026-08-17'),plannedEnd:new Date('2026-08-20'),status:'Completed',progress:100},
    {projectId:pr1.id,projectPanelId:pp1.id,departmentId:depts.Automation.id,taskName:'PLC software development',assignedUserId:diya.id,plannedStart:new Date('2026-08-20'),plannedEnd:new Date('2026-08-28'),status:'In Progress',progress:65},
    {projectId:pr1.id,projectPanelId:pp1.id,departmentId:depts.Production.id,taskName:'Panel wiring and assembly',assignedUserId:kabir.id,plannedStart:new Date('2026-08-24'),plannedEnd:new Date('2026-09-01'),status:'Pending',progress:25},
    {projectId:pr2.id,projectPanelId:pp2.id,departmentId:depts.Design.id,taskName:'GA and SLD preparation',assignedUserId:aarav.id,plannedStart:new Date('2026-08-24'),plannedEnd:new Date('2026-08-29'),status:'In Progress',progress:50},
    {projectId:pr2.id,projectPanelId:pp3.id,departmentId:depts.Purchase.id,taskName:'Release approved BOM for procurement',plannedStart:new Date('2026-08-29'),plannedEnd:new Date('2026-09-03'),status:'Pending',progress:0},
  ]});

  await prisma.timesheetTask.createMany({data:[
    {title:'PLC software development',taskSource:'PROJECT',sourceTaskKey:'seed-pr1-plc',projectId:pr1.id,departmentId:depts.Automation.id,assignedUserId:diya.id,createdById:admin.id,startDate:new Date('2026-08-20'),dueDate:new Date('2026-08-28'),status:'In Progress',priority:'High',actualHours:12,remarks:'Linked example project task'},
    {title:'Electrical drawing preparation',taskSource:'PROJECT',sourceTaskKey:'seed-pr1-design',projectId:pr1.id,departmentId:depts.Design.id,assignedUserId:aarav.id,createdById:admin.id,startDate:new Date('2026-08-17'),dueDate:new Date('2026-08-20'),actualEndDate:new Date('2026-08-20'),status:'Completed',priority:'Medium',actualHours:9},
    {title:'Prepare weekly technical review',taskSource:'USER',departmentId:depts.Automation.id,assignedUserId:diya.id,createdById:meera.id,startDate:new Date('2026-09-06'),dueDate:new Date('2026-09-07'),status:'Pending',priority:'Medium',estimatedHours:2},
  ]});

  let bomRoot;
  for (const [code,name] of [['GA','General Arrangement'],['BOM','Bill of Material'],['QAP','Quality Assurance Plan'],['OTHER','Other Document'],['TICKET_ATTACHMENT','Ticket Attachment']]) {
    const type=await prisma.documentType.create({ data:{ documentTypeCode:code, documentTypeName:name } });
    if(code==='BOM')bomRoot=type;
  }
  await prisma.documentType.createMany({data:[
    {documentTypeCode:'BOM_TECHNICAL',documentTypeName:'Technical BOM',parentDocumentTypeId:bomRoot.id},
    {documentTypeCode:'BOM_COMMERCIAL',documentTypeName:'Commercial BOM',parentDocumentTypeId:bomRoot.id},
  ]});
  await prisma.auditLog.createMany({ data:[
    { userId:admin.id,module:'CUSTOMERS',action:'UPDATE',recordId:c1.id,source:'WEB',ipAddress:'127.0.0.1',remarks:'Seed audit log' },
    { userId:diya.id,module:'INQUIRIES',action:'UPDATE',recordId:i1.id,source:'WEB',ipAddress:'127.0.0.1',remarks:'Seed audit log' },
  ]});
  await prisma.notification.create({ data:{ eventType:'INQUIRY_CREATED',entityType:'INQUIRY',entityId:i1.id,title:'Inquiry created',message:`${i1.inquiryNo} was created`,createdById:admin.id,
    recipients:{create:[{userId:admin.id},{userId:aarav.id},{userId:diya.id}]}} });

  console.log('Seed complete. Login: admin@nexus.local / Admin@123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

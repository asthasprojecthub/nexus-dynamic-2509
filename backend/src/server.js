import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { prisma } from './lib/prisma.js';
import { authRequired, signToken } from './lib/auth.js';
import { writeAudit } from './lib/audit.js';
import { serializeAudit, serializeCustomer, serializeInquiry, serializeProject, serializeVersion } from './lib/serializers.js';
import { buildInquiryPdf, buildInquiryPdfFileName, loadInquiryPdfModel } from './services/inquiryPdfService.js';
import { buildTicketPdf, buildTicketRmaPdf, buildTicketPdfFileName } from './services/ticketPdfService.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });
const upload = multer({ dest:uploadRoot, limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||20)*1024*1024} });
const cleanupUpload = (file) => { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); };
const cleanupUploads = (files = []) => { for (const file of files) cleanupUpload(file); };

const DEFAULT_INQUIRY_STATUSES = ['New','Technical Evaluation','Technical BoM Submitted','BoM Approval Pending','Revision','Commercial BOM Submission','Order Won','Order Lost','Inquiry Hold'];
const SYSTEM_INQUIRY_STATUS_NAMES = new Set(DEFAULT_INQUIRY_STATUSES);

const statusCode = (name) => String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
const serializeInquiryStatusMaster = (row) => ({
  id: row.id,
  status_code: row.statusCode,
  status_name: row.statusName,
  behavior: row.behavior || 'STANDARD',
  display_order: row.displayOrder,
  requires_popup: row.requiresPopup,
  reason_options: Array.isArray(row.reasonOptions) ? row.reasonOptions : [],
  popup_fields: Array.isArray(row.popupFields) ? row.popupFields : [],
  is_active: row.isActive,
});

async function activeInquiryStatusRows(tx = prisma) {
  const rows = await tx.inquiryStatusMaster.findMany({ where:{ isActive:true }, orderBy:[{ displayOrder:'asc' },{ statusName:'asc' }] });
  if (rows.length) return rows;
  return DEFAULT_INQUIRY_STATUSES.map((name, index) => ({
    id:`fallback-${index}`,
    statusCode:statusCode(name),
    statusName:name,
    behavior:'STANDARD',
    displayOrder:index + 1,
    requiresPopup:['Technical BoM Submitted','BoM Approval Pending','Revision','Commercial BOM Submission','Order Won','Order Lost','Inquiry Hold'].includes(name),
    reasonOptions:name === 'Order Lost' ? ['Price','Commercial','Priority','Timing','Trust Issue','Certification'] : name === 'Inquiry Hold' ? ['Due to Customer','Specification','Technical','Commercial'] : [],
    popupFields:[],
    isActive:true,
  }));
}

app.use(helmet());
app.use(cors({ origin: (process.env.FRONTEND_URL || 'http://localhost:5173').split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

const asyncRoute = (fn) => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const toBool = (v, fallback=true) => v === undefined ? fallback : !!v;

const meetingInclude = { attendees:{ include:{ user:true } }, createdBy:true };
const timeValue = (value) => value ? new Date(value).toISOString().slice(11,16) : '';
const dateValue = (value) => value ? new Date(value).toISOString().slice(0,10) : '';
const meetingTimeDate = (value) => new Date(`1970-01-01T${value}:00Z`);
const serializeMeeting = (meeting) => ({
  id:meeting.id,
  inquiry_id:meeting.inquiryId,
  project_id:meeting.projectId,
  meeting_type:meeting.meetingType,
  title:meeting.title,
  agenda:meeting.agenda || '',
  meeting_date:dateValue(meeting.meetingDate),
  start_time:timeValue(meeting.startTime),
  end_time:timeValue(meeting.endTime),
  location:meeting.location || '',
  meeting_link:meeting.meetingLink || '',
  status:meeting.status,
  created_by:meeting.createdBy?.fullName || 'System',
  created_at:meeting.createdAt?.toISOString?.() || '',
  user_ids:(meeting.attendees || []).map((item) => item.userId),
  attendees:(meeting.attendees || []).map((item) => ({ id:item.userId, full_name:item.user?.fullName || 'User', email:item.user?.email || '' })),
});

async function activeUserIds(tx) {
  const users = await tx.user.findMany({ where:{ isActive:true }, select:{ id:true } });
  return users.map((user) => user.id);
}

async function actorName(tx, req) {
  if (!req.user?.id) return 'System';
  const user = await tx.user.findUnique({ where:{ id:req.user.id }, select:{ fullName:true } });
  return user?.fullName || req.user.email || 'User';
}

async function createNotification(tx, req, { eventType, entityType, entityId = null, title, message, payload = {}, userIds = [] }) {
  const admins=await tx.user.findMany({where:{isActive:true,role:{roleCode:'ADMIN'}},select:{id:true}});
  const adminIds=new Set(admins.map((user)=>user.id));
  const actorIsAdmin=adminIds.has(req.user?.id);
  const recipients=[...new Set([...(userIds||[]),...adminIds].filter((id)=>id && (id!==req.user?.id || actorIsAdmin)))];
  if (!recipients.length) return null;
  return tx.notification.create({
    data:{
      eventType,
      entityType,
      entityId,
      title,
      message,
      payload,
      createdById:req.user?.id || null,
      recipients:{ create:recipients.map((userId) => ({ userId })) },
    },
  });
}

async function createInquiryNotification(tx, req, { eventType, inquiryId, title, message, payload = {} }) {
  const userIds = await activeUserIds(tx);
  return createNotification(tx, req, {
    eventType,
    entityType:'INQUIRY',
    entityId:inquiryId,
    title,
    message,
    payload,
    userIds,
  });
}

async function projectAudienceUserIds(tx, uiData = {}, actorId = null) {
  const departmentNames = [...new Set((Array.isArray(uiData?.departments) ? uiData.departments : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  const users = await tx.user.findMany({
    where:{ isActive:true },
    include:{ role:true, userDepartments:{ include:{ department:true } } },
  });
  return users
    .filter((user) => {
      const role = String(user.role?.roleCode || '').toUpperCase();
      if (role === 'ADMIN') return true;
      if (actorId && user.id === actorId) return true;
      if (!departmentNames.length) return false;
      return (user.userDepartments || []).some((membership) => departmentNames.includes(membership.department?.departmentName));
    })
    .map((user) => user.id);
}

async function createProjectNotification(tx, req, { eventType, project, title, message, payload = {}, userIds = null }) {
  const recipients = Array.isArray(userIds)
    ? userIds
    : await projectAudienceUserIds(tx, project?.uiData || {}, req.user?.id || null);
  return createNotification(tx, req, {
    eventType,
    entityType:'PROJECT',
    entityId:project?.id || null,
    title,
    message,
    payload,
    userIds:recipients,
  });
}

const assignmentChangedRows = (oldRows = [], newRows = []) => {
  const oldById = new Map((oldRows || []).map((row) => [String(row.id || ''), row]));
  return (newRows || []).filter((row) => {
    const assigned = String(row.assigned_to || '').trim();
    if (!assigned) return false;
    const old = oldById.get(String(row.id || ''));
    return !old || String(old.assigned_to || '').trim() !== assigned;
  });
};

async function createProjectTaskAssignmentNotifications(tx, req, project, rows = []) {
  const names = [...new Set(rows.map((row) => String(row.assigned_to || '').trim()).filter(Boolean))];
  if (!names.length) return;
  const users = await tx.user.findMany({ where:{ fullName:{ in:names }, isActive:true }, select:{ id:true, fullName:true } });
  const byName = new Map(users.map((user) => [user.fullName, user]));
  for (const row of rows) {
    const user = byName.get(String(row.assigned_to || '').trim());
    if (!user) continue;
    const taskName = String(row.task || 'Project Task').trim();
    const detail = [project.projectNo, project.projectName, row.panel, row.department].filter(Boolean).join(' · ');
    await createProjectNotification(tx, req, {
      eventType:'PROJECT_TASK_ASSIGNED',
      project,
      title:`Project Task Assigned - ${taskName}`.slice(0, 180),
      message:detail || `A project task was assigned to ${user.fullName}.`,
      payload:{
        project_no:project.projectNo,
        project_name:project.projectName,
        task:taskName,
        assigned_to:user.fullName,
        panel:row.panel || '',
        department:row.department || '',
        source_task_key:String(row.id || ''),
      },
      // Assignment notifications go to the assignee and all Admins.
      userIds:[user.id],
    });
  }
}

async function createMeetingNotification(tx, req, meeting, userIds, eventType) {
  if (meeting.inquiryId) {
    const inquiry = await tx.inquiry.findUnique({ where:{ id:meeting.inquiryId }, select:{ inquiryNo:true } });
    const scheduled = eventType === 'KICKOFF_MEETING_UPDATED' ? 'updated' : 'scheduled';
    await createInquiryNotification(tx, req, {
      eventType,
      inquiryId:meeting.inquiryId,
      title:`Kickoff Meeting ${scheduled === 'updated' ? 'Updated' : 'Scheduled'} - ${inquiry?.inquiryNo || 'Inquiry'}`,
      message:`Kickoff meeting was ${scheduled} for ${dateValue(meeting.meetingDate)} at ${timeValue(meeting.startTime)}.`,
      payload:{ meeting_id:meeting.id, meeting_type:meeting.meetingType },
    });
    return;
  }
  if (meeting.projectId) {
    const project = await tx.project.findUnique({ where:{ id:meeting.projectId } });
    if (!project) return;
    const scheduled = eventType.includes('UPDATED') ? 'updated' : 'scheduled';
    await createProjectNotification(tx, req, {
      eventType,
      project,
      title:`Project Meeting ${scheduled === 'updated' ? 'Updated' : 'Scheduled'} - ${project.projectNo}`,
      message:`${meeting.title || 'Project Meeting'} was ${scheduled} for ${dateValue(meeting.meetingDate)} at ${timeValue(meeting.startTime)}.`,
      payload:{ meeting_id:meeting.id, meeting_type:meeting.meetingType, project_no:project.projectNo },
      userIds,
    });
  }
}

const notificationWeekStart = () => new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

async function listNotifications(userId) {
  const createdAt = { gte:notificationWeekStart() };
  if (userId) {
    const user=await prisma.user.findUnique({where:{id:userId},select:{role:{select:{roleCode:true}}}});
    const admin=user?.role?.roleCode==='ADMIN';
    const rows = await prisma.notificationRecipient.findMany({
      where:{ userId, notification:{ createdAt, ...(admin?{}:{createdById:{not:userId}}) } },
      include:{ notification:true },
      orderBy:{ notification:{ createdAt:'desc' } },
      take:100,
    });
    return rows.map((row) => ({ id:row.notificationId, user_id:row.userId, title:row.notification.title, message:row.notification.message, event_type:row.notification.eventType, entity_type:row.notification.entityType, entity_id:row.notification.entityId, payload:row.notification.payload || {}, is_read:row.isRead, created_at:row.notification.createdAt.toISOString() }));
  }
  return [];
}

const ACCESS_PAGES = [
  {
    module:'DASHBOARD', label:'Dashboard', suggested_owner_department:'All',
    actions:[
      { key:'VIEW', label:'View Dashboard', display_key:'Dashboard - View Dashboard' },
    ],
  },
  {
    module:'INQUIRIES', label:'Inquiries', suggested_owner_department:'SALES / ESTIMATION',
    actions:[
      { key:'CREATE', label:'Create Inquiry', display_key:'Inquiries - Create Inquiry' },
      { key:'VIEW', label:'View Inquiry', display_key:'Inquiries - View Inquiry' },
      { key:'UPDATE', label:'Edit Inquiry', display_key:'Inquiries - Edit Inquiry' },
      // Delete capability removed system-wide for Inquiries (see docs/NEW-BASE-CHANGES.md).
      { key:'FOLLOW_UP', label:'Follow-up / Reminder', display_key:'Inquiries - Follow-up / Reminder' },
      { key:'STATUS_CHANGE', label:'Change Inquiry Status', display_key:'Inquiries - Change Inquiry Status' },
      { key:'KICKOFF', label:'Schedule / Edit Kickoff', display_key:'Inquiries - Kickoff Meeting' },
      { key:'CONVERT_TO_PROJECT', label:'Kickoff Done / Convert to Project', display_key:'Inquiries - Convert to Project' },
    ],
  },
  {
    module:'PROJECTS', label:'Projects', suggested_owner_department:'DESIGN / AUTOMATION / PRODUCTION',
    actions:[
      { key:'CREATE', label:'Create Project', display_key:'Projects - Create Project' },
      { key:'VIEW', label:'View Project', display_key:'Projects - View Project' },
      { key:'UPDATE', label:'Edit Project', display_key:'Projects - Edit Project' },
      { key:'PLANNING_GRID', label:'Project Planning Grid', display_key:'Projects - Project Planning Grid' },
      { key:'DUPLICATE_PLANNING_GRID', label:'Add Duplicate Planning Grid', display_key:'Projects - Add Duplicate Planning Grid' },
      { key:'UPDATE_COMPLETION', label:'Update Task Status / Completion', display_key:'Projects - Update Task Status / Completion' },
      { key:'MARK_COMPLETED', label:'Mark Completed', display_key:'Projects - Mark Completed' },
      { key:'UPLOAD_DOCUMENTS', label:'Upload Project Documents', display_key:'Projects - Upload Documents' },
      // Delete capability removed system-wide for Projects (see docs/NEW-BASE-CHANGES.md).
    ],
  },
  {
    module:'TICKETS', label:'Tickets', suggested_owner_department:'STORE / SALES / TECHNICAL',
    actions:[
      { key:'CREATE', label:'Create Ticket', display_key:'Tickets - Create Ticket' },
      { key:'VIEW', label:'View Tickets', display_key:'Tickets - View Tickets' },
      { key:'UPDATE', label:'Edit Ticket', display_key:'Tickets - Edit Ticket' },
      { key:'ASSIGN', label:'Assign Ticket', display_key:'Tickets - Assign Ticket' },
      { key:'STATUS_CHANGE', label:'Change Ticket Status', display_key:'Tickets - Change Status' },
    ],
  },
  {
    module:'TICKET_MASTER', label:'Ticket Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Ticket Master', display_key:'Ticket Master - View' },
      { key:'CREATE', label:'Create Master Option', display_key:'Ticket Master - Create' },
      { key:'UPDATE', label:'Edit Master Option', display_key:'Ticket Master - Edit' },
    ],
  },
  {
    module:'TICKET_WORKFLOW', label:'Ticket Workflow Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Ticket Workflow', display_key:'Ticket Workflow - View' },
      { key:'CREATE', label:'Create Workflow Status', display_key:'Ticket Workflow - Create' },
      { key:'UPDATE', label:'Edit Workflow Status', display_key:'Ticket Workflow - Edit' },
    ],
  },
  {
    module:'CUSTOMERS', label:'Customers', suggested_owner_department:'SALES',
    actions:[
      { key:'CREATE', label:'Create Customer', display_key:'Customers - Create Customer' },
      { key:'VIEW', label:'View Customer', display_key:'Customers - View Customer' },
      { key:'UPDATE', label:'Edit Customer', display_key:'Customers - Edit Customer' },
    ],
  },
  {
    module:'NOTIFICATIONS', label:'Notifications', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Notifications', display_key:'Notifications - View Notifications' },
      { key:'SEND', label:'Send Notifications', display_key:'Notifications - Send Notifications' },
    ],
  },
  {
    module:'TIMESHEET', label:'Timesheet', suggested_owner_department:'All',
    actions:[
      { key:'CREATE', label:'Fill Timesheet', display_key:'Timesheet - Fill Timesheet' },
      { key:'VIEW', label:'View Own Timesheet', display_key:'Timesheet - View Own Timesheet' },
      { key:'UPDATE', label:'Edit Own Timesheet', display_key:'Timesheet - Edit Own Timesheet' },
      { key:'TEAM_VIEW', label:'View Team Timesheet', display_key:'Timesheet - View Team Timesheet' },
      { key:'ASSIGN', label:'Assign / Reassign Timesheet', display_key:'Timesheet - Assign Timesheet' },
      { key:'APPROVE', label:'Approve Timesheet', display_key:'Timesheet - Approve Timesheet' },
    ],
  },
  {
    module:'TIMESHEET_MASTER', label:'Timesheet Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Timesheet Master', display_key:'Timesheet Master - View' },
      { key:'CREATE', label:'Create Team Task', display_key:'Timesheet Master - Create Team Task' },
      { key:'UPDATE', label:'Edit Team Task', display_key:'Timesheet Master - Edit Team Task' },
      { key:'ASSIGN', label:'Assign Team Task', display_key:'Timesheet Master - Assign Team Task' },
      { key:'DELETE', label:'Archive Team Task', display_key:'Timesheet Master - Archive Team Task' },
    ],
  },
  {
    module:'INQUIRY_MASTER', label:'Inquiry Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Inquiry Master', display_key:'Inquiry Master - View' },
      { key:'CREATE', label:'Create Version / Status', display_key:'Inquiry Master - Create' },
      { key:'UPDATE', label:'Edit Version / Status', display_key:'Inquiry Master - Edit' },
    ],
  },
  {
    module:'PANEL_MASTER', label:'Panel Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Panel Master', display_key:'Panel Master - View' },
      { key:'CREATE', label:'Create Panel / Version', display_key:'Panel Master - Create' },
      { key:'UPDATE', label:'Edit Panel / Version', display_key:'Panel Master - Edit' },
    ],
  },
  {
    module:'PROJECT_MASTER', label:'Project Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Project Master', display_key:'Project Master - View' },
      { key:'CREATE', label:'Create Version', display_key:'Project Master - Create' },
      { key:'UPDATE', label:'Edit Version', display_key:'Project Master - Edit' },
    ],
  },
  {
    module:'PLANNING_GRID_MASTER', label:'Planning Grid Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Planning Grid Master', display_key:'Planning Grid Master - View' },
      { key:'CREATE', label:'Create Version / Task', display_key:'Planning Grid Master - Create' },
      { key:'UPDATE', label:'Edit Version / Task', display_key:'Planning Grid Master - Edit' },
      { key:'DELETE', label:'Deactivate Task', display_key:'Planning Grid Master - Delete' },
    ],
  },
  {
    module:'DEPARTMENTS', label:'Department Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Department Master', display_key:'Department Master - View' },
      { key:'CREATE', label:'Create Department', display_key:'Department Master - Create' },
      { key:'UPDATE', label:'Edit Department', display_key:'Department Master - Edit' },
    ],
  },
  {
    module:'DOCUMENT_TYPES', label:'Document Type Master', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Document Type Master', display_key:'Document Type Master - View' },
      { key:'CREATE', label:'Create Document Type', display_key:'Document Type Master - Create' },
      { key:'UPDATE', label:'Edit Document Type', display_key:'Document Type Master - Edit' },
    ],
  },
  {
    module:'USERS', label:'User Management', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Users', display_key:'User Management - View Users' },
      { key:'CREATE', label:'Create User', display_key:'User Management - Create User' },
      { key:'UPDATE', label:'Edit User', display_key:'User Management - Edit User' },
      { key:'MANAGE_ACCESS', label:'Manage User Permissions', display_key:'User Management - Manage Permissions' },
    ],
  },
  {
    module:'AUDIT_LOGS', label:'Audit Logs', suggested_owner_department:'ADMIN',
    actions:[
      { key:'VIEW', label:'View Audit Logs', display_key:'Audit Logs - View Audit Logs' },
    ],
  },
];

const accessActionKey = (action) => typeof action === 'string' ? action : action.key;
const accessActionLabel = (action) => typeof action === 'string' ? action.replaceAll('_',' ') : (action.label || action.key);
const accessCatalogKeys = () => ACCESS_PAGES.flatMap((page) => page.actions.map((action) => `${page.module}.${accessActionKey(action)}`));


const adminOnly = (req,res,next) => {
  if (req.user?.role === 'ADMIN' || req.user?.devBypass) return next();
  return res.status(403).json({ error:'Admin permission required' });
};

const accessManagerOnly = asyncRoute(async (req,res,next) => {
  if (req.user?.role === 'ADMIN' || req.user?.devBypass || await hasEffectivePermission(req.user?.id,'USERS.MANAGE_ACCESS')) return next();
  return res.status(403).json({ error:'User Management - Manage Permissions permission required' });
});

const userAccessViewOnly = asyncRoute(async (req,res,next) => {
  if (req.user?.role === 'ADMIN' || req.user?.devBypass || await hasEffectivePermission(req.user?.id,'USERS.VIEW') || await hasEffectivePermission(req.user?.id,'USERS.MANAGE_ACCESS')) return next();
  return res.status(403).json({ error:'User Management - View Users permission required' });
});

async function ensureAccessCatalog() {
  const keys = [];
  for (const page of ACCESS_PAGES) {
    for (const actionDef of page.actions) {
      const action = accessActionKey(actionDef);
      const permissionKey = `${page.module}.${action}`;
      keys.push(permissionKey);
      await prisma.permission.upsert({
        where:{ permissionKey },
        update:{ module:page.module, action, description:`${accessActionLabel(actionDef)} permission for ${page.label}`, isActive:true },
        create:{ permissionKey, module:page.module, action, description:`${accessActionLabel(actionDef)} permission for ${page.label}`, isActive:true },
      });
    }
  }
  const admin = await prisma.role.findUnique({ where:{ roleCode:'ADMIN' } });
  if (admin) {
    const permissions = await prisma.permission.findMany({ where:{ permissionKey:{ in:keys } }, select:{ id:true } });
    if (permissions.length) await prisma.rolePermission.createMany({ data:permissions.map((permission) => ({ roleId:admin.id, permissionId:permission.id })), skipDuplicates:true });
    if (!admin.isActive) await prisma.role.update({ where:{ id:admin.id }, data:{ isActive:true } });
  }
  return keys;
}

app.get('/api/health', asyncRoute(async (_req,res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status:'ok', database:'connected', timestamp:new Date().toISOString() });
}));

app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error:'Email and password are required' });
  const user = await prisma.user.findUnique({ where:{ email }, include:{ role:true, userDepartments:{ include:{ department:true, role:true } } } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error:'Invalid credentials' });
  req.user={id:user.id,email:user.email};
  await writeAudit(req,{module:'AUTH',action:'LOGIN',recordId:user.id,newValues:{logged_in:true}});
  res.json({ token:signToken(user), user:{ id:user.id, employee_no:user.employeeNo, full_name:user.fullName, email:user.email, role:user.role?.roleCode,
    departments:user.userDepartments.map(x => ({ id:x.departmentId, name:x.department.departmentName, role:x.role.roleCode })) } });
}));

app.use('/api', authRequired);
app.use('/api', asyncRoute(async (req,_res,next) => {
  if (req.user?.devBypass && !req.user.id) {
    const admin = await prisma.user.findFirst({ where:{ isActive:true, role:{ roleCode:'ADMIN' } }, select:{ id:true, email:true } });
    if (admin) { req.user.id=admin.id; req.user.email=admin.email; }
  }
  next();
}));

app.post('/api/auth/change-password', asyncRoute(async (req,res) => {
  const { old_password, new_password } = req.body || {};
  if (!req.user?.id) return res.status(401).json({error:'Sign in again to change your password.'});
  if (!old_password || typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 128)
    return res.status(400).json({error:'Enter the old password and a new password of 8 to 128 characters.'});
  const user = await prisma.user.findUnique({where:{id:req.user.id}});
  if (!user?.isActive || !(await bcrypt.compare(old_password,user.passwordHash)))
    return res.status(400).json({error:'Old password is incorrect.'});
  if (await bcrypt.compare(new_password,user.passwordHash)) return res.status(400).json({error:'Choose a different new password.'});
  await prisma.user.update({where:{id:user.id},data:{passwordHash:await bcrypt.hash(new_password,12)}});
  await writeAudit(req,{module:'USERS',action:'PASSWORD_CHANGE',recordId:user.id,newValues:{password_changed:true}});
  res.json({ok:true});
}));

app.patch('/api/auth/profile', asyncRoute(async (req,res) => {
  if(!req.user?.id)return res.status(401).json({error:'Sign in again to edit your profile.'});
  const fullName=String(req.body?.full_name||'').trim();
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(fullName.length<2 || fullName.length>120)return res.status(400).json({error:'Full name must be between 2 and 120 characters.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>180)return res.status(400).json({error:'Enter a valid email address.'});
  const [old,duplicate]=await Promise.all([
    prisma.user.findUnique({where:{id:req.user.id}}),
    prisma.user.findFirst({where:{email,id:{not:req.user.id}},select:{id:true}}),
  ]);
  if(!old?.isActive)return res.status(404).json({error:'Active user account not found.'});
  if(duplicate)return res.status(409).json({error:'This email address is already used by another user.'});
  const updated=await prisma.user.update({where:{id:old.id},data:{fullName,email}});
  await writeAudit(req,{module:'USERS',action:'PROFILE_UPDATE',recordId:updated.id,oldValues:{full_name:old.fullName,email:old.email},newValues:{full_name:updated.fullName,email:updated.email}});
  res.json({id:updated.id,full_name:updated.fullName,email:updated.email});
}));

app.post('/api/users/:id/reset-password', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'USERS.RESET_PASSWORD')))return;
  const { new_password }=req.body||{};
  if(typeof new_password!=='string' || new_password.length<8 || new_password.length>128)
    return res.status(400).json({error:'Enter a new password of 8 to 128 characters.'});
  const [actor,target]=await Promise.all([
    prisma.user.findUnique({where:{id:req.user.id},include:{role:true}}),
    prisma.user.findUnique({where:{id:req.params.id},include:{role:true}}),
  ]);
  if(!actor?.isActive || String(actor.role?.roleCode||'').toUpperCase()!=='ADMIN')
    return res.status(403).json({error:'Only an Admin can change another user’s password.'});
  if(!target)return res.status(404).json({error:'User not found.'});
  if(await bcrypt.compare(new_password,target.passwordHash))return res.status(400).json({error:'Choose a different new password.'});
  await prisma.user.update({where:{id:target.id},data:{passwordHash:await bcrypt.hash(new_password,12)}});
  await writeAudit(req,{module:'USERS',action:'PASSWORD_RESET',recordId:target.id,newValues:{password_reset:true,reset_by:actor.fullName}});
  res.json({ok:true});
}));

async function hasEffectivePermission(userId, permissionKey) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where:{ id:userId },
    include:{
      role:{ include:{ rolePermissions:{ include:{ permission:true } } } },
      userPermissions:{ include:{ permission:true } },
    },
  });
  if (!user || !user.isActive) return false;
  if (String(user.role?.roleCode || '').toUpperCase() === 'ADMIN') return true;

  const personal = (user.userPermissions || []).find((row) => row.permission?.permissionKey === permissionKey);
  if (personal) return !!personal.isAllowed;
  return (user.role?.rolePermissions || []).some((row) => row.permission?.permissionKey === permissionKey && row.permission?.isActive !== false);
}

async function requireEffectivePermission(req, res, permissionKey) {
  if (await hasEffectivePermission(req.user?.id, permissionKey)) return true;
  res.status(403).json({ error:'You do not have permission to perform this action.' });
  return false;
}

// Inquiry actions are controlled by each user's effective permissions. Sales users
// can receive the full inquiry workflow, while Estimation receives status access.
async function requireInquiryWriteScope(req, res, inquiry) {
  if (!req.user?.id || !inquiry) return false;
  const user = await prisma.user.findUnique({
    where:{ id:req.user.id },
    include:{ role:true, userDepartments:{ include:{ department:true } } },
  });
  if (!user || !user.isActive) {
    res.status(401).json({ error:'Not authenticated.' });
    return false;
  }
  const role = String(user.role?.roleCode || '').toUpperCase();
  if (role === 'ADMIN') return true;
  return true;
}

// "Edit" scope for the general inquiry PATCH endpoint only.
// Admin/HOD/TL and anyone in the Sales department get full edit rights on
// any inquiry ("Sales Role: All Inquiry rights"). Everyone else (a plain
// Normal Employee, e.g. Estimation staff who only hold STATUS_CHANGE) may
// edit only the inquiries they personally created.
async function requireInquiryEditScope(req, res, inquiry) {
  if (!req.user?.id || !inquiry) {
    res.status(401).json({ error:'Not authenticated.' });
    return false;
  }
  const actor = await loadActorAccessContext(req.user.id);
  if (!actor.id) {
    res.status(401).json({ error:'Not authenticated.' });
    return false;
  }
  if (actor.roleCode === 'ADMIN' || ['HOD','TL'].includes(actor.roleCode)) return true;
  if (actor.departmentNames.has('SALES')) return true;
  if (inquiry.createdById && inquiry.createdById === actor.id) return true;
  res.status(403).json({ error:'Normal employees can edit only inquiries they created.' });
  return false;
}
const actorCanEditInquiry = (actor, inquiry) => {
  if (!actor?.id) return false;
  if (actor.roleCode === 'ADMIN' || ['HOD','TL'].includes(actor.roleCode)) return true;
  if (actor.departmentNames.has('SALES')) return true;
  return !!inquiry?.createdById && inquiry.createdById === actor.id;
};
// Business rule: only the Automation and Store departments may create or
// edit tickets (any role level within those departments). Every other
// department -- Sales included -- is view-only, regardless of their
// TICKETS.CREATE / TICKETS.UPDATE grant. Admin is unrestricted.
const TICKET_WRITE_DEPARTMENTS = new Set(['AUTOMATION', 'STORE']);
const actorCanWriteTickets = (actor) => {
  if (!actor?.id) return false;
  if (actor.roleCode === 'ADMIN') return true;
  for (const name of actor.departmentNames) if (TICKET_WRITE_DEPARTMENTS.has(name)) return true;
  return false;
};

const accessName = (value) => String(value || '').trim().toUpperCase();
const actorAccessContext = (user) => ({
  id:user?.id || null,
  fullName:accessName(user?.fullName),
  roleCode:accessName(user?.role?.roleCode),
  departmentIds:new Set((user?.userDepartments || []).map((row)=>row.departmentId).filter(Boolean)),
  departmentNames:new Set((user?.userDepartments || []).map((row)=>accessName(row.department?.departmentName)).filter(Boolean)),
});

async function loadActorAccessContext(userId) {
  if(!userId) return actorAccessContext(null);
  const user=await prisma.user.findUnique({
    where:{id:userId},
    include:{role:true,userDepartments:{include:{department:true}}},
  });
  return actorAccessContext(user);
}

const projectScope = (project) => {
  const ui=project?.uiData && typeof project.uiData==='object' && !Array.isArray(project.uiData) ? project.uiData : {};
  const rows=Array.isArray(ui.planning_grid) ? ui.planning_grid : [];
  return {
    departmentIds:new Set([
      ...(project?.departments || []).map((row)=>row.departmentId),
      ...(project?.planning || []).map((row)=>row.departmentId),
    ].filter(Boolean)),
    departmentNames:new Set([
      ...(Array.isArray(ui.departments) ? ui.departments : []),
      ...rows.map((row)=>row.department),
      ...(project?.departments || []).map((row)=>row.department?.departmentName),
      ...(project?.planning || []).map((row)=>row.department?.departmentName),
    ].map(accessName).filter(Boolean)),
    assigneeIds:new Set((project?.planning || []).map((row)=>row.assignedUserId).filter(Boolean)),
    assigneeNames:new Set([
      ...(Array.isArray(ui.assignments) ? ui.assignments : []),
      ...rows.map((row)=>row.assigned_to),
      ...(project?.planning || []).map((row)=>row.assignedUser?.fullName),
    ].map(accessName).filter(Boolean)),
  };
};

const setsIntersect = (left, right) => [...left].some((value)=>right.has(value));
const actorCanViewProject = (actor, project) => {
  if(!actor?.id) return false;
  if(actor.roleCode==='ADMIN') return true;
  const scope=projectScope(project);
  if(actor.departmentNames.has('SALES')) return true;
  if(project?.createdById===actor.id || scope.assigneeIds.has(actor.id) || scope.assigneeNames.has(actor.fullName)) return true;
  return setsIntersect(actor.departmentIds,scope.departmentIds) || setsIntersect(actor.departmentNames,scope.departmentNames);
};
const actorCanManageProject = (actor, project) => {
  if(actor?.roleCode==='ADMIN') return true;
  if(!['HOD','TL'].includes(actor?.roleCode)) return false;
  const scope=projectScope(project);
  return setsIntersect(actor.departmentIds,scope.departmentIds) || setsIntersect(actor.departmentNames,scope.departmentNames);
};
async function requireProjectRecordAccess(req,res,project,manage=false) {
  const actor=await loadActorAccessContext(req.user?.id);
  if((manage ? actorCanManageProject(actor,project) : actorCanViewProject(actor,project))) return true;
  res.status(403).json({error:'This project is outside your department or assignment scope.'});
  return false;
}

// View/Edit rights are assignment-based for every role (Sales, Automation
// Store, Employee, HOD, TL): a user can access a ticket only if they
// created it or are actively assigned to it. Admin always has full access.
const actorCanAccessTicket = (actor, ticket) => {
  if(!actor?.id) return false;
  if(actor.roleCode==='ADMIN') return true;
  const assignments=ticket?.assignments || [];
  return ticket?.createdById===actor.id || assignments.some((row)=>row.isActive!==false && row.userId===actor.id);
};
async function requireTicketRecordAccess(req,res,ticket) {
  const actor=await loadActorAccessContext(req.user?.id);
  if(actorCanAccessTicket(actor,ticket)) return true;
  res.status(403).json({error:'This ticket is outside your department or assignment scope.'});
  return false;
}

async function getEffectivePermissionKeys(userId) {
  if (!userId) return [];
  const user = await prisma.user.findUnique({
    where:{ id:userId },
    include:{
      role:{ include:{ rolePermissions:{ include:{ permission:true } } } },
      userPermissions:{ include:{ permission:true } },
    },
  });
  if (!user || !user.isActive) return [];
  if (String(user.role?.roleCode || '').toUpperCase() === 'ADMIN') {
    const rows = await prisma.permission.findMany({ where:{ isActive:true }, select:{ permissionKey:true } });
    return rows.map((row) => row.permissionKey);
  }
  const keys = new Set((user.role?.rolePermissions || [])
    .filter((row) => row.permission?.isActive !== false)
    .map((row) => row.permission.permissionKey));
  for (const row of user.userPermissions || []) {
    const key = row.permission?.permissionKey;
    if (!key) continue;
    if (row.isAllowed) keys.add(key); else keys.delete(key);
  }
  return [...keys];
}

const normalizeDocumentToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isTechnicalBomDocumentType = (type) => {
  if (!type?.parent?.isActive) return false;
  const leaf = `${normalizeDocumentToken(type.documentTypeCode)} ${normalizeDocumentToken(type.documentTypeName)}`;
  const parent = type.parent ? `${normalizeDocumentToken(type.parent.documentTypeCode)} ${normalizeDocumentToken(type.parent.documentTypeName)}` : '';
  const bomRoot = parent.includes('bom') || parent.includes('billofmaterial');
  const isNonTechnical = leaf.includes('nontechnical') || leaf.includes('nontech');
  return bomRoot && leaf.includes('technical') && !isNonTechnical;
};
const isCommercialBomDocumentType = (type) => {
  if (!type?.parent?.isActive) return false;
  const leaf = `${normalizeDocumentToken(type.documentTypeCode)} ${normalizeDocumentToken(type.documentTypeName)}`;
  const parent = type.parent ? `${normalizeDocumentToken(type.parent.documentTypeCode)} ${normalizeDocumentToken(type.parent.documentTypeName)}` : '';
  const bomRoot = parent.includes('bom') || parent.includes('billofmaterial');
  return bomRoot && leaf.includes('commercial');
};

const documentDisplayName = (enteredName, originalName) => {
  const original = path.basename(String(originalName || 'document'));
  let entered = path.basename(String(enteredName || '').trim()).replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim();
  if (!entered) entered = original;
  const originalExt = path.extname(original);
  const enteredExt = path.extname(entered);
  if (!enteredExt && originalExt) entered += originalExt;
  return entered.slice(0, 255);
};

const versionInclude = { sections:{ include:{ fields:{ include:{ options:true } } } } };
const projectInclude = {
  customer:true, inquiry:true,
  departments:{ include:{ department:true } },
  panels:{ include:{ panelMaster:true } },
  planning:{ include:{ department:true, assignedUser:true, projectPanel:{ include:{ panelMaster:true } } } },
};
const inquiryInclude = { customer:true, panels:{ include:{ panelMaster:true } }, fieldValues:{ include:{ formField:true } }, statusHistory:{ orderBy:{ changedAt:'desc' }, take:50 }, meetings:{ where:{ meetingType:'KICKOFF' }, include:meetingInclude, orderBy:{ createdAt:'desc' }, take:1 }, projects:{ select:{ id:true, projectNo:true }, take:1, orderBy:{ createdAt:'desc' } } };
const customerInclude = { createdBy:true, departments:{ include:{ contacts:true } }, _count:{ select:{ projects:true } } };
const ticketInclude = {
  customer:true, inquiry:true, project:true, formVersion:true,
  currentStatus:true, createdBy:true, createdDepartment:true,
  assignments:{include:{department:true,user:true,assignedBy:true},orderBy:{assignedAt:'asc'}},
  workSessions:{include:{user:true},orderBy:{startedAt:'desc'}},
  documents:{include:{document:{include:{documentType:true}}},orderBy:{createdAt:'desc'}},
  statusHistory:{
    include:{fromStatus:true,toStatus:true,changedBy:true,documents:{include:{document:{include:{documentType:true}}}}},
    orderBy:{changedAt:'desc'},
  },
};
const asArray = (value) => Array.isArray(value) ? value : [];
const serializeTicketWorkflow = (row) => ({
  id:row.id, status_code:row.statusCode, status_name:row.statusName, status_category:row.statusCategory,
  sequence:row.sequence, color:row.color, sla_days:row.slaDays, popup_required:row.popupRequired,
  dynamic_fields:asArray(row.dynamicFields), allowed_next_status_codes:asArray(row.allowedNextStatusCodes),
  allowed_role_codes:asArray(row.allowedRoleCodes), allowed_department_ids:asArray(row.allowedDepartmentIds),
  notification_rules:row.notificationRules || {}, escalation_rules:row.escalationRules || {}, is_active:row.isActive,
});
const serializeTicketDocument = (link) => ({
  id:link.document.id, status_history_id:link.statusHistoryId || null, description:link.description || '',
  document_role:link.documentRole || 'ATTACHMENT',
  file_name:link.document.originalFileName, document_type:link.document.documentType?.documentTypeName || 'Ticket Attachment',
  mime_type:link.document.mimeType || '', file_size:link.document.fileSize ? Number(link.document.fileSize) : null,
  uploaded_at:link.document.uploadedAt.toISOString(), download_url:`/api/documents/${link.document.id}/download`,
});
const liveSessionSeconds = (session) => Number(session.elapsedSeconds || 0) +
  (session.status==='RUNNING' && session.lastResumedAt ? Math.max(0,Math.floor((Date.now()-new Date(session.lastResumedAt).getTime())/1000)) : 0);
const serializeTicket = (row) => ({
  id:row.id, ticket_no:row.ticketNo, customer_id:row.customerId, customer:row.customer?.customerName || '',
  customer_no:row.customer?.customerNo || '', customer_type:row.customer?.customerType || '', customer_city:row.customer?.city || '',
  subject:row.subject, ticket_type:row.ticketType, problem_type:row.problemType,
  manufacturer:row.manufacturer || '', model_number:row.modelNumber, received_via:row.receivedVia || '',
  warranty_status:row.warrantyStatus || '', support_mode:row.supportMode || '', support_type:row.supportType || '',
  complaint:row.complaint, customer_comment:row.customerComment || '', priority:row.priority,
  inquiry_id:row.inquiryId || '', inquiry_no:row.inquiry?.inquiryNo || '', project_id:row.projectId || '', project_no:row.project?.projectNo || '',
  form_version_id:row.formVersionId || '', current_phase:row.currentPhase,
  phase1_data:row.phase1Data && typeof row.phase1Data==='object' ? row.phase1Data : {}, phase1_submitted_at:row.phase1SubmittedAt?.toISOString?.() || null,
  repair_location:row.repairLocation || '', repair_details:row.repairDetails && typeof row.repairDetails==='object' ? row.repairDetails : {}, phase2_data:row.phase2Data && typeof row.phase2Data==='object' ? row.phase2Data : {}, phase2_submitted_at:row.phase2SubmittedAt?.toISOString?.() || null,
  rma_no:row.rmaNo || '', rma_data:row.rmaData && typeof row.rmaData==='object' ? row.rmaData : {}, rma_generated_at:row.rmaGeneratedAt?.toISOString?.() || null,
  assignments:(row.assignments || []).map((item)=>({id:item.id,department_id:item.departmentId || '',department:item.department?.departmentName || '',user_id:item.userId || '',user:item.user?.fullName || '',assigned_by:item.assignedBy?.fullName || '',assigned_at:item.assignedAt.toISOString(),is_active:item.isActive})),
  assigned_to:(row.assignments || []).filter((item)=>item.isActive && item.user).map((item)=>item.user.fullName).join(', '),
  assigned_department:(row.assignments || []).filter((item)=>item.isActive && item.department).map((item)=>item.department.departmentName).filter((value,index,array)=>array.indexOf(value)===index).join(', '),
  work_sessions:(row.workSessions || []).map((item)=>({id:item.id,user_id:item.userId,user:item.user?.fullName || '',status:item.status,started_at:item.startedAt.toISOString(),paused_at:item.pausedAt?.toISOString?.() || null,stopped_at:item.stoppedAt?.toISOString?.() || null,elapsed_seconds:liveSessionSeconds(item),remarks:item.remarks || ''})),
  current_status_id:row.currentStatusId, status:row.currentStatus?.statusName || '', status_code:row.currentStatus?.statusCode || '',
  status_color:row.currentStatus?.color || '#64748b', status_category:row.currentStatus?.statusCategory || '',
  status_entered_at:row.statusEnteredAt.toISOString(), sla_due_at:row.slaDueAt?.toISOString?.() || null,
  is_overdue:row.isOverdue || (!!row.slaDueAt && row.slaDueAt.getTime()<Date.now() && !row.closedAt),
  created_by_id:row.createdById, created_by:row.createdBy?.fullName || '', created_department_id:row.createdDepartmentId || '',
  created_department:row.createdDepartment?.departmentName || '', created_at:row.createdAt.toISOString(), updated_at:row.updatedAt.toISOString(), closed_at:row.closedAt?.toISOString?.() || null,
  ticket_form_version_id:row.formVersionId || '',
  ticket_data:row.phase1Data && typeof row.phase1Data==='object' ? row.phase1Data : {},
  documents:(row.documents || []).map(serializeTicketDocument),
  status_history:(row.statusHistory || []).map((history)=>({
    id:history.id, from_status:history.fromStatus?.statusName || '', to_status:history.toStatus?.statusName || '',
    to_status_color:history.toStatus?.color || '#64748b', response_data:history.responseData || {}, note:history.note || '',
    sla_days:history.slaDaysSnapshot, sla_due_at:history.slaDueAt?.toISOString?.() || null, was_overdue:history.wasOverdue,
    changed_by:history.changedBy?.fullName || '', changed_at:history.changedAt.toISOString(),
    documents:(history.documents || []).map(serializeTicketDocument),
  })),
});

async function getBootstrap(userId = null) {
  await processTicketSla();
  const [customers, departments, users, inquiryMaster, projectMaster, ticketFormMaster, panelMasters, planningTasks, planningGridVersions, inquiries, projects, documentTypes, documents, inquiryDocuments, projectDocuments, auditLogs, notifications, inquiryStatuses, tickets, ticketWorkflows, ticketDocuments] = await Promise.all([
    prisma.customer.findMany({ include:customerInclude, orderBy:{ customerName:'asc' } }),
    prisma.department.findMany({ orderBy:{ departmentName:'asc' } }),
    prisma.user.findMany({ include:{ role:true, userDepartments:{ include:{ department:true, role:true } } }, orderBy:{ fullName:'asc' } }),
    prisma.formMaster.findFirst({ where:{ formType:'INQUIRY' }, include:{ versions:{ include:versionInclude, orderBy:{ versionNo:'desc' } } } }),
    prisma.formMaster.findFirst({ where:{ formType:'PROJECT' }, include:{ versions:{ include:versionInclude, orderBy:{ versionNo:'desc' } } } }),
    prisma.formMaster.findFirst({ where:{ formType:'TICKET' }, include:{ versions:{ include:versionInclude, orderBy:{ versionNo:'desc' } } } }),
    prisma.panelMaster.findMany({ include:{ formMaster:{ include:{ versions:{ include:versionInclude, orderBy:{ versionNo:'desc' } } } } }, orderBy:{ panelType:'asc' } }),
    prisma.planningTaskMaster.findMany({ where:{ isActive:true }, include:{ department:true }, orderBy:[{departmentId:'asc'},{displayOrder:'asc'}] }),
    prisma.planningGridVersion.findMany({ orderBy:{ versionNo:'desc' } }),
    prisma.inquiry.findMany({ include:inquiryInclude, orderBy:{ createdAt:'desc' } }),
    prisma.project.findMany({ include:projectInclude, orderBy:{ createdAt:'desc' } }),
    prisma.documentType.findMany({ orderBy:{ documentTypeName:'asc' } }),
    prisma.document.findMany({ include:{ uploadedBy:true }, orderBy:{ uploadedAt:'desc' } }),
    prisma.inquiryDocument.findMany(),
    prisma.projectDocument.findMany(),
    prisma.auditLog.findMany({ include:{ user:true }, orderBy:{ createdAt:'desc' }, take:200 }),
    listNotifications(userId),
    activeInquiryStatusRows(prisma),
    prisma.ticket.findMany({include:ticketInclude,orderBy:{createdAt:'desc'}}),
    prisma.ticketWorkflowStatus.findMany({orderBy:[{sequence:'asc'},{statusName:'asc'}]}),
    prisma.ticketDocument.findMany(),
  ]);
  const taskMap = {};
  for (const d of departments) taskMap[d.departmentName] = [];
  for (const t of planningTasks) taskMap[t.department.departmentName].push({ id:t.id, name:t.taskName });
  const currentUserRecord=users.find((user)=>user.id===userId) || null;
  const effectivePermissions = currentUserRecord ? await getEffectivePermissionKeys(currentUserRecord.id) : [];
  const can = (permissionKey) => !currentUserRecord || effectivePermissions.includes(permissionKey);
  const currentActor=actorAccessContext(currentUserRecord);
  const visibleProjects=!currentUserRecord ? projects : projects.filter((project)=>actorCanViewProject(currentActor,project));
  const visibleTickets=!currentUserRecord ? tickets : tickets.filter((ticket)=>actorCanAccessTicket(currentActor,ticket));
  const visibleProjectIds=new Set(visibleProjects.map((project)=>project.id));
  const visibleTicketIds=new Set(visibleTickets.map((ticket)=>ticket.id));
  const currentDepartmentIds = new Set((currentUserRecord?.userDepartments || []).map((row)=>row.departmentId));
  const canManageUsers = can('USERS.VIEW');
  const canViewInquiryDocs = can('INQUIRIES.VIEW');
  const canViewProjectDocs = can('PROJECTS.VIEW');
  const canViewTicketDocs = can('TICKETS.VIEW');
  const canUseDocumentTypes = canViewInquiryDocs || canViewProjectDocs || canViewTicketDocs || can('INQUIRIES.CREATE') || can('INQUIRIES.STATUS_CHANGE') || can('PROJECTS.CREATE') || can('TICKETS.CREATE') || can('DOCUMENT_TYPES.VIEW');
  const allowedDocumentIds = new Set([
    ...(canViewInquiryDocs ? inquiryDocuments.filter((row)=>row.isActive!==false).map((row)=>row.documentId) : []),
    ...(canViewProjectDocs ? projectDocuments.filter((row)=>row.isActive!==false && visibleProjectIds.has(row.projectId)).map((row)=>row.documentId) : []),
    ...(canViewTicketDocs ? ticketDocuments.filter((row)=>visibleTicketIds.has(row.ticketId)).map((row)=>row.documentId) : []),
  ]);
  const canUsePlanningReference = can('PROJECTS.VIEW') || can('PROJECTS.CREATE') || can('PROJECTS.UPDATE') || can('PROJECTS.PLANNING_GRID') || can('PLANNING_GRID_MASTER.VIEW');
  const canUseInquiryForms = can('INQUIRIES.VIEW') || can('INQUIRIES.CREATE') || can('INQUIRIES.UPDATE') || can('INQUIRY_MASTER.VIEW');
  const canUseProjectForms = can('PROJECTS.VIEW') || can('PROJECTS.CREATE') || can('PROJECTS.UPDATE') || can('PROJECT_MASTER.VIEW');
  const canUsePanelForms = canUseInquiryForms || canUseProjectForms || can('PANEL_MASTER.VIEW');
  const canUseTicketAssignment = can('TICKETS.CREATE') || can('TICKETS.ASSIGN');
  const visibleUsers = canManageUsers || canUseTicketAssignment ? users : users.filter((user)=>
    user.id===currentUserRecord?.id || (user.userDepartments || []).some((row)=>currentDepartmentIds.has(row.departmentId))
  );
  const serializeBootstrapVersion = (version) => {
    const serialized = serializeVersion(version);
    const creationAudit = !version.createdById
      ? auditLogs.find((log) => log.recordId === version.id && log.action === 'VERSION_CREATE')
      : null;
    const creatorId = version.createdById || creationAudit?.userId || null;
    const creator = users.find((user) => user.id === creatorId);
    return { ...serialized, created_by_id:creatorId, created_by:creator?.fullName || serialized.created_by };
  };
  return {
    customers: can('CUSTOMERS.VIEW') ? customers.map(serializeCustomer) : [],
    // Departments are also reference data for project planning and team-scoped Timesheets.
    departments: departments.map(d => ({ id:d.id, department_code:d.departmentCode, department_name:d.departmentName, is_active:d.isActive, created_at:d.createdAt.toISOString().slice(0,10) })),
    users: visibleUsers.map(u => ({ id:u.id, employee_no:canManageUsers ? u.employeeNo : '', full_name:u.fullName, email:canManageUsers ? u.email : '', role:canManageUsers ? (u.role?.roleName || '') : '', role_code:u.role?.roleCode || '', is_active:u.isActive,
      departments:u.userDepartments.map(x => x.department.departmentName), created_at:canManageUsers ? u.createdAt.toISOString().slice(0,10) : '' })),
    inquiryMaster: canUseInquiryForms && inquiryMaster ? { id:inquiryMaster.id, versions:inquiryMaster.versions.map(serializeBootstrapVersion) } : { id:inquiryMaster?.id || null, versions:[] },
    projectMaster: canUseProjectForms && projectMaster ? { id:projectMaster.id, versions:projectMaster.versions.map(serializeBootstrapVersion) } : { id:projectMaster?.id || null, versions:[] },
    ticketMaster: (can('TICKETS.VIEW') || can('TICKETS.CREATE') || can('TICKET_MASTER.VIEW')) && ticketFormMaster ? { id:ticketFormMaster.id, versions:ticketFormMaster.versions.map(serializeBootstrapVersion) } : { id:ticketFormMaster?.id || null, versions:[] },
    planningGridMaster: canUsePlanningReference ? (()=>{ const active=planningGridVersions.find((v)=>v.isActive); return active ? { id:active.id, version_no:active.versionNo, form_name:active.formName, statuses:Array.isArray(active.statuses)?active.statuses:[], department_tasks:(active.departmentTasks && typeof active.departmentTasks==='object')?active.departmentTasks:taskMap, is_active:true } : { id:'db-planning-grid', version_no:0, form_name:'Project Planning Grid', statuses:['Pending','In Progress','Delay','Completed','On Hold'], department_tasks:taskMap, is_active:true }; })() : { id:null, version_no:0, form_name:'Project Planning Grid', statuses:[], department_tasks:{}, is_active:false },
    planningGridVersions: canUsePlanningReference ? planningGridVersions.map((v)=>({ id:v.id, version_no:v.versionNo, form_name:v.formName, statuses:Array.isArray(v.statuses)?v.statuses:[], department_tasks:(v.departmentTasks && typeof v.departmentTasks==='object')?v.departmentTasks:{}, is_active:v.isActive, created_at:v.createdAt.toISOString() })) : [],
    panelMasters: panelMasters.map(p => ({ id:p.id, panel_code:p.panelCode, panel_type:p.panelType, form_name:p.formMaster.formName, is_active:p.isActive,
      created_at:p.createdAt.toISOString().slice(0,10), versions:canUsePanelForms ? p.formMaster.versions.map(serializeBootstrapVersion) : [] })),
    panels: panelMasters.map(p => ({ id:p.id, panel_code:p.panelCode, panel_type:p.panelType, is_active:p.isActive, dynamic_data:{} })),
    inquiries: can('INQUIRIES.VIEW') ? inquiries.map((inquiry) => {
      const linkedProject = visibleProjects.find((project) => project.inquiryId === inquiry.id);
      const kickoffMeeting = inquiry.meetings?.[0] ? serializeMeeting(inquiry.meetings[0]) : null;
      const serializedInquiry = serializeInquiry(inquiry);
      const projectCreated = Boolean(linkedProject || inquiry.uiData?.converted_to_project || inquiry.uiData?.project_id);
      return {
        ...serializedInquiry,
        can_edit:can('INQUIRIES.UPDATE') && actorCanEditInquiry(currentActor,inquiry),
        can_change_status:can('INQUIRIES.STATUS_CHANGE'),
        can_kickoff:can('INQUIRIES.KICKOFF') || can('INQUIRIES.CONVERT_TO_PROJECT'),
        kickoff_meeting:kickoffMeeting,
        project_created:projectCreated,
        project_id:linkedProject?.id || null,
        project_no:linkedProject?.projectNo || '',
        amendment:Boolean(projectCreated && inquiry.uiData?.amendment_active && inquiry.status !== 'Order Won'),
        amendment_message:projectCreated && inquiry.uiData?.amendment_active && inquiry.status !== 'Order Won'
          ? `Amendment started after the converted inquiry changed from Order Won to ${inquiry.status}.`
          : '',
      };
    }) : [],
    projects: can('PROJECTS.VIEW') ? visibleProjects.map((project) => ({
      ...serializeProject(project, users.find((user) => user.id === project.createdById)?.fullName || ''),
      can_edit:can('PROJECTS.UPDATE') && actorCanManageProject(currentActor,project),
    })) : [],
    inquiryStatuses: (can('INQUIRIES.VIEW') || can('INQUIRY_MASTER.VIEW')) ? inquiryStatuses.map(serializeInquiryStatusMaster) : [],
    tickets: can('TICKETS.VIEW') ? visibleTickets.map(serializeTicket) : [],
    ticketWorkflows: (can('TICKETS.VIEW') || can('TICKETS.CREATE') || can('TICKET_WORKFLOW.VIEW')) ? ticketWorkflows.map(serializeTicketWorkflow) : [],
    ticketMasterOptions: [],
    currentUser: currentUserRecord ? {
      id:currentUserRecord.id,
      full_name:currentUserRecord.fullName,
      email:currentUserRecord.email,
      role_code:currentUserRecord.role?.roleCode || '',
      role:currentUserRecord.role?.roleName || '',
      departments:currentUserRecord.userDepartments.map((item)=>item.department.departmentName),
      permissions:effectivePermissions,
    } : null,
    documentTypes: canUseDocumentTypes ? documentTypes.map(d => ({ id:d.id, document_type_code:d.documentTypeCode, document_type_name:d.documentTypeName, parent_document_type_id:d.parentDocumentTypeId || null, is_active:d.isActive })) : [],
    documents: documents.filter((d)=>allowedDocumentIds.has(d.id)).map(d => ({ id:d.id, document_type_id:d.documentTypeId, file_name:d.fileName, original_file_name:d.originalFileName, file_path:`/api/documents/${d.id}/download`, mime_type:d.mimeType,
      file_size:d.fileSize ? Number(d.fileSize) : null, version_no:d.versionNo, is_active:d.isActive, uploaded_by:d.uploadedBy?.fullName || 'System', uploaded_at:d.uploadedAt.toISOString() })),
    inquiryDocuments: canViewInquiryDocs ? inquiryDocuments.map(x => ({ id:`${x.inquiryId}:${x.documentId}`, inquiry_id:x.inquiryId, document_id:x.documentId, description:x.description || '', is_active:x.isActive, created_at:x.createdAt.toISOString() })) : [],
    projectDocuments: canViewProjectDocs ? projectDocuments.filter((x)=>visibleProjectIds.has(x.projectId)).map(x => ({ id:`${x.projectId}:${x.documentId}`, project_id:x.projectId, document_id:x.documentId, description:x.description || '', is_active:x.isActive, created_at:x.createdAt.toISOString() })) : [],
    auditLogs: can('AUDIT_LOGS.VIEW') ? auditLogs.map(serializeAudit) : [],
    notifications: can('NOTIFICATIONS.VIEW') ? notifications : [],
  };
}

app.get('/api/bootstrap', asyncRoute(async (req,res) => res.json(await getBootstrap(req.user?.id || null))));

app.get('/api/inquiry-statuses', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRY_MASTER.VIEW'))) return;
  const rows=await prisma.inquiryStatusMaster.findMany({orderBy:[{displayOrder:'asc'},{statusName:'asc'}]});
  res.json(rows.map(serializeInquiryStatusMaster));
}));

app.post('/api/inquiry-statuses', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRY_MASTER.CREATE'))) return;
  const name=String(req.body.status_name||'').trim();
  if(!name) return res.status(400).json({error:'Status name is required.'});
  const max=await prisma.inquiryStatusMaster.aggregate({_max:{displayOrder:true}});
  const behavior=String(req.body.behavior||'STANDARD').toUpperCase();
  const row=await prisma.inquiryStatusMaster.create({data:{
    statusCode:statusCode(req.body.status_code||name),
    statusName:name,
    behavior:['STANDARD','REASON'].includes(behavior)?behavior:'STANDARD',
    displayOrder:Number(req.body.display_order||((max._max.displayOrder||0)+1)),
    requiresPopup:req.body.requires_popup===true || behavior==='REASON',
    reasonOptions:Array.isArray(req.body.reason_options)?req.body.reason_options.filter(Boolean):[],
    popupFields:Array.isArray(req.body.popup_fields)?req.body.popup_fields.filter((field)=>field && field.label):[],
    isActive:toBool(req.body.is_active),
  }});
  await writeAudit(req,{module:'INQUIRY_MASTER',action:'STATUS_CREATE',recordId:row.id,newValues:req.body});
  res.status(201).json(serializeInquiryStatusMaster(row));
}));

app.patch('/api/inquiry-statuses/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRY_MASTER.UPDATE'))) return;
  const old=await prisma.inquiryStatusMaster.findUnique({where:{id:req.params.id}});
  if(!old) return res.status(404).json({error:'Inquiry status not found.'});
  if(SYSTEM_INQUIRY_STATUS_NAMES.has(old.statusName)){
    if(req.body.is_active===false) return res.status(400).json({error:'Built-in workflow statuses cannot be deactivated.'});
    if(req.body.status_name!==undefined && String(req.body.status_name).trim()!==old.statusName) return res.status(400).json({error:'Built-in workflow status names cannot be changed.'});
  }
  const name=req.body.status_name===undefined?old.statusName:String(req.body.status_name||'').trim();
  if(!name) return res.status(400).json({error:'Status name is required.'});
  const behavior=String(req.body.behavior||old.behavior||'STANDARD').toUpperCase();
  const row=await prisma.inquiryStatusMaster.update({where:{id:req.params.id},data:{
    statusCode:req.body.status_code===undefined?undefined:statusCode(req.body.status_code||name),
    statusName:name,
    behavior:['STANDARD','REASON'].includes(behavior)?behavior:'STANDARD',
    displayOrder:req.body.display_order===undefined?undefined:Number(req.body.display_order),
    requiresPopup:req.body.requires_popup===undefined?undefined:!!req.body.requires_popup,
    reasonOptions:req.body.reason_options===undefined?undefined:(Array.isArray(req.body.reason_options)?req.body.reason_options.filter(Boolean):[]),
    popupFields:req.body.popup_fields===undefined?undefined:(Array.isArray(req.body.popup_fields)?req.body.popup_fields.filter((field)=>field && field.label):[]),
    isActive:req.body.is_active===undefined?undefined:!!req.body.is_active,
  }});
  await writeAudit(req,{module:'INQUIRY_MASTER',action:'STATUS_UPDATE',recordId:row.id,oldValues:serializeInquiryStatusMaster(old),newValues:req.body});
  res.json(serializeInquiryStatusMaster(row));
}));

app.get('/api/access-control', userAccessViewOnly, asyncRoute(async (_req,res) => {
  const catalogKeys = await ensureAccessCatalog();
  const [roles, permissions, users] = await Promise.all([
    prisma.role.findMany({ include:{ rolePermissions:{ include:{ permission:true } } }, orderBy:{ roleName:'asc' } }),
    prisma.permission.findMany({ where:{ permissionKey:{ in:catalogKeys } }, orderBy:[{module:'asc'},{action:'asc'}] }),
    prisma.user.findMany({
      include:{
        role:{ include:{ rolePermissions:{ include:{ permission:true } } } },
        userPermissions:{ include:{ permission:true } },
      },
      orderBy:{ fullName:'asc' },
    }),
  ]);

  const roleDefaults = {};
  for (const role of roles) {
    roleDefaults[role.id] = role.roleCode === 'ADMIN'
      ? [...catalogKeys]
      : role.rolePermissions.map((item) => item.permission.permissionKey).filter((key) => catalogKeys.includes(key));
  }

  const assignments = {};
  const customized = {};
  for (const user of users) {
    const catalogRows = user.userPermissions.filter((item) => catalogKeys.includes(item.permission.permissionKey));
    const hasCustom = catalogRows.length > 0;
    customized[user.id] = hasCustom;
    if (user.role?.roleCode === 'ADMIN') assignments[user.id] = [...catalogKeys];
    else if (hasCustom) assignments[user.id] = catalogRows.filter((item) => item.isAllowed).map((item) => item.permission.permissionKey);
    else assignments[user.id] = roleDefaults[user.roleId] || [];
  }

  res.json({
    roles: roles.map((role) => ({ id:role.id, role_code:role.roleCode, role_name:role.roleName, description:role.description || '', is_active:role.isActive })),
    users: users.map((user) => ({
      id:user.id,
      employee_no:user.employeeNo,
      full_name:user.fullName,
      email:user.email,
      role_id:user.roleId || '',
      role_code:user.role?.roleCode || '',
      role_name:user.role?.roleName || '',
      is_active:user.isActive,
      customized:customized[user.id],
    })),
    pages: ACCESS_PAGES,
    permissions: permissions.map((permission) => ({ id:permission.id, permission_key:permission.permissionKey, module:permission.module, action:permission.action, description:permission.description || '', is_active:permission.isActive })),
    role_defaults: roleDefaults,
    assignments,
  });
}));

app.put('/api/access-control/users/:id', accessManagerOnly, asyncRoute(async (req,res) => {
  const catalogKeys = await ensureAccessCatalog();
  const [user, roles, catalogPermissions] = await Promise.all([
    prisma.user.findUnique({
      where:{ id:req.params.id },
      include:{
        role:{ include:{ rolePermissions:{ include:{ permission:true } } } },
        userPermissions:{ include:{ permission:true } },
      },
    }),
    prisma.role.findMany({ include:{ rolePermissions:{ include:{ permission:true } } } }),
    prisma.permission.findMany({ where:{ permissionKey:{ in:catalogKeys } }, select:{ id:true, permissionKey:true } }),
  ]);
  if (!user) return res.status(404).json({ error:'User not found' });

  const roleId = req.body.role_id || user.roleId;
  const targetRole = roles.find((role) => role.id === roleId);
  if (!targetRole) return res.status(400).json({ error:'Choose a valid role' });
  if (!targetRole.isActive) return res.status(400).json({ error:'This role is inactive' });

  const requested = Array.isArray(req.body.permission_keys) ? [...new Set(req.body.permission_keys)] : [];
  const invalid = requested.filter((key) => !catalogKeys.includes(key));
  if (invalid.length) return res.status(400).json({ error:`Unknown permission: ${invalid[0]}` });

  const oldCatalogRows = user.userPermissions.filter((item) => catalogKeys.includes(item.permission.permissionKey));
  const oldHasCustom = oldCatalogRows.length > 0;
  const oldRoleDefault = user.role?.roleCode === 'ADMIN'
    ? [...catalogKeys]
    : (user.role?.rolePermissions || []).map((item) => item.permission.permissionKey).filter((key) => catalogKeys.includes(key));
  const oldPermissionKeys = user.role?.roleCode === 'ADMIN'
    ? [...catalogKeys]
    : oldHasCustom
      ? oldCatalogRows.filter((item) => item.isAllowed).map((item) => item.permission.permissionKey)
      : oldRoleDefault;

  const finalPermissionKeys = targetRole.roleCode === 'ADMIN' ? [...catalogKeys] : requested;
  const finalSet = new Set(finalPermissionKeys);
  const before = {
    employee_no:user.employeeNo,
    full_name:user.fullName,
    role:user.role?.roleName || '',
    role_code:user.role?.roleCode || '',
    is_active:user.isActive,
    permission_keys:oldPermissionKeys,
  };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where:{ id:user.id }, data:{ roleId:targetRole.id, isActive:toBool(req.body.is_active, user.isActive) } });
    await tx.userPermission.deleteMany({ where:{ userId:user.id, permissionId:{ in:catalogPermissions.map((permission) => permission.id) } } });
    if (catalogPermissions.length) {
      await tx.userPermission.createMany({
        data:catalogPermissions.map((permission) => ({ userId:user.id, permissionId:permission.id, isAllowed:finalSet.has(permission.permissionKey) })),
      });
    }
  });

  const after = {
    employee_no:user.employeeNo,
    full_name:user.fullName,
    role:targetRole.roleName,
    role_code:targetRole.roleCode,
    is_active:toBool(req.body.is_active, user.isActive),
    permission_keys:finalPermissionKeys,
  };
  await writeAudit(req,{ module:'USER_ACCESS', action:'UPDATE', recordId:user.id, oldValues:before, newValues:after });
  res.json({ ok:true, user_id:user.id, role_id:targetRole.id, ...after });
}));

app.get('/api/customers', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'CUSTOMERS.VIEW'))) return;
  const customers = await prisma.customer.findMany({ include:customerInclude, orderBy:{ customerName:'asc' } });
  res.json(customers.map(serializeCustomer));
}));

const TEN_DIGIT_MOBILE = /^\d{10}$/;
const MOBILE_FIELD_PATTERN = /\b(mobile|phone|whatsapp|contact\s*(?:no|number))\b/i;
const isMobileFieldName = (value) => MOBILE_FIELD_PATTERN.test(String(value || '').replace(/[_-]+/g, ' '));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateTenDigitMobile(value, label = 'Mobile number') {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!TEN_DIGIT_MOBILE.test(text)) {
    throw Object.assign(new Error(`${label} must contain exactly 10 digits.`), { statusCode:400 });
  }
  return text;
}

function normalizeCustomerContacts(contacts = []) {
  return contacts
    .filter((item) => String(item.contact_name || '').trim())
    .map((item) => ({
      ...item,
      contact_name:String(item.contact_name || '').trim(),
      department_name:String(item.department_name || '').trim(),
      phone:validateTenDigitMobile(item.phone, `Mobile number for ${String(item.contact_name || 'contact').trim() || 'contact'}`),
    }));
}

async function replaceCustomerContacts(tx, customerId, contacts) {
  const normalized = normalizeCustomerContacts(contacts);
  const missingDepartment = normalized.find((contact) => !contact.department_name);
  if (missingDepartment) {
    throw Object.assign(new Error(`Department / Team is required for contact ${missingDepartment.contact_name}.`), { statusCode:400 });
  }

  // customer_departments remains an internal normalized relation so the existing DB does not need
  // a destructive redesign. The UI no longer manages this table independently.
  await tx.customerDepartment.deleteMany({ where:{ customerId } });

  const departmentByName = new Map();
  for (const contact of normalized) {
    const key = contact.department_name.toLowerCase();
    if (!departmentByName.has(key)) {
      const department = await tx.customerDepartment.create({
        data:{ customerId, departmentName:contact.department_name, departmentCode:null, isActive:true },
      });
      departmentByName.set(key, department);
    }
  }

  for (const contact of normalized) {
    const department = departmentByName.get(contact.department_name.toLowerCase());
    await tx.customerContact.create({
      data:{
        customerDepartmentId:department.id,
        contactName:contact.contact_name,
        designation:contact.designation || null,
        stakeholderRole:contact.stakeholder_role || null,
        email:contact.email || null,
        phone:contact.phone || null,
        isPrimary:!!contact.is_primary,
        isActive:toBool(contact.is_active),
      },
    });
  }
}

app.post('/api/customers', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'CUSTOMERS.CREATE'))) return;
  const b=req.body;
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data:{
        customerNo:b.customer_no,
        customerName:b.customer_name,
        customerType:b.customer_type || null,
        city:String(b.city || '').trim() || null,
        createdById:req.user?.id || null,
        isActive:toBool(b.is_active),
      },
    });
    await replaceCustomerContacts(tx, customer.id, b.contacts || []);
    return tx.customer.findUnique({ where:{ id:customer.id }, include:customerInclude });
  });
  await writeAudit(req,{module:'CUSTOMERS',action:'CREATE',recordId:created.id,newValues:b});
  res.status(201).json(serializeCustomer(created));
}));

app.patch('/api/customers/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'CUSTOMERS.UPDATE'))) return;
  const old=await prisma.customer.findUnique({where:{id:req.params.id},include:customerInclude});
  if(!old)return res.status(404).json({error:'Customer not found'});
  const b=req.body;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where:{id:req.params.id}, data:{
      customerNo:b.customer_no === undefined ? undefined : b.customer_no,
      customerName:b.customer_name === undefined ? undefined : b.customer_name,
      customerType:b.customer_type === undefined ? undefined : b.customer_type,
      city:b.city === undefined ? undefined : (String(b.city || '').trim() || null),
      isActive:b.is_active === undefined ? undefined : b.is_active,
    }});
    if (Array.isArray(b.contacts)) await replaceCustomerContacts(tx, req.params.id, b.contacts);
    return tx.customer.findUnique({ where:{id:req.params.id}, include:customerInclude });
  });
  await writeAudit(req,{module:'CUSTOMERS',action:'UPDATE',recordId:updated.id,oldValues:serializeCustomer(old),newValues:b});
  res.json(serializeCustomer(updated));
}));

async function resolveDocumentTypeParent(parentId, selfId = null) {
  if (!parentId) return null;
  if (selfId && parentId === selfId) throw Object.assign(new Error('A document type cannot be its own parent.'), { statusCode:400 });
  const parent = await prisma.documentType.findUnique({ where:{ id:parentId } });
  if (!parent || !parent.isActive) throw Object.assign(new Error('Choose an active parent document type.'), { statusCode:400 });
  if (parent.parentDocumentTypeId) throw Object.assign(new Error('Only one subtype level is supported. Choose a root document type as parent.'), { statusCode:400 });
  return parent;
}

app.post('/api/document-types', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'DOCUMENT_TYPES.CREATE'))) return;
  const b=req.body;
  await resolveDocumentTypeParent(b.parent_document_type_id || null);
  const d=await prisma.documentType.create({data:{documentTypeCode:String(b.document_type_code || '').trim(),documentTypeName:String(b.document_type_name || '').trim(),parentDocumentTypeId:b.parent_document_type_id || null,isActive:toBool(b.is_active)}});
  await writeAudit(req,{module:'DOCUMENT_TYPES',action:'CREATE',recordId:d.id,newValues:b});
  res.status(201).json({id:d.id});
}));
app.patch('/api/document-types/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'DOCUMENT_TYPES.UPDATE'))) return;
  const b=req.body;
  const old=await prisma.documentType.findUnique({where:{id:req.params.id}});
  if(!old) return res.status(404).json({error:'Document type not found'});
  if(['BOM','BOM_TECHNICAL','BOM_COMMERCIAL'].includes(old.documentTypeCode) &&
    (b.is_active===false || (Object.prototype.hasOwnProperty.call(b,'parent_document_type_id') && (b.parent_document_type_id||null)!==old.parentDocumentTypeId) ||
      (b.document_type_code && b.document_type_code!==old.documentTypeCode)))
    return res.status(400).json({error:'The system BOM type and its required subtypes must remain active under BOM.'});
  await resolveDocumentTypeParent(b.parent_document_type_id || null, req.params.id);
  if (old.parentDocumentTypeId !== (b.parent_document_type_id || null)) {
    const childCount=await prisma.documentType.count({where:{parentDocumentTypeId:req.params.id}});
    if(childCount) return res.status(400).json({error:'This document type already has subtypes and cannot be converted into a subtype.'});
  }
  const d=await prisma.documentType.update({where:{id:req.params.id},data:{documentTypeCode:String(b.document_type_code || old.documentTypeCode).trim(),documentTypeName:String(b.document_type_name || old.documentTypeName).trim(),parentDocumentTypeId:b.parent_document_type_id || null,isActive:toBool(b.is_active,old.isActive)}});
  await writeAudit(req,{module:'DOCUMENT_TYPES',action:'UPDATE',recordId:d.id,oldValues:{document_type_code:old.documentTypeCode,document_type_name:old.documentTypeName,parent_document_type_id:old.parentDocumentTypeId,is_active:old.isActive},newValues:b});
  res.json({id:d.id});
}));

app.post('/api/departments', asyncRoute(async (req,res) => { if(!(await requireEffectivePermission(req,res,'DEPARTMENTS.CREATE'))) return; const b=req.body; const d=await prisma.department.create({data:{departmentCode:b.department_code,departmentName:b.department_name,isActive:toBool(b.is_active)}}); await writeAudit(req,{module:'DEPARTMENTS',action:'CREATE',recordId:d.id,newValues:b}); res.status(201).json(d); }));
app.patch('/api/departments/:id', asyncRoute(async (req,res) => { if(!(await requireEffectivePermission(req,res,'DEPARTMENTS.UPDATE'))) return; const b=req.body; const d=await prisma.department.update({where:{id:req.params.id},data:{departmentCode:b.department_code,departmentName:b.department_name,isActive:b.is_active}}); await writeAudit(req,{module:'DEPARTMENTS',action:'UPDATE',recordId:d.id,newValues:b}); res.json(d); }));

const validateRoleDepartments = (roleCode, departments = []) => {
  const code=String(roleCode||'').toUpperCase();
  const count=[...new Set((departments||[]).filter(Boolean))].length;
  if(code==='ADMIN' && count>0) return 'Admin is organization-wide and should not be restricted to a department.';
  if(code==='HOD' && count<1) return 'HOD must be assigned to at least one department.';
  if(code==='TL' && count!==1) return 'Team Lead must be assigned to exactly one department.';
  if(code==='EMPLOYEE' && count!==1) return 'Employee must be assigned to exactly one department.';
  return '';
};

app.post('/api/users', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'USERS.CREATE'))) return;
  const b=req.body;
  const role=b.role_id
    ? await prisma.role.findUnique({where:{id:b.role_id}})
    : await prisma.role.findFirst({where:{OR:[{roleCode:b.role_code||String(b.role||'EMPLOYEE').toUpperCase().replaceAll(' ','_').replace('TEAM_LEAD','TL')},{roleName:b.role||''}]}});
  if (!role) return res.status(400).json({error:'Choose a valid role'});
  const roleDepartmentError=validateRoleDepartments(role.roleCode,b.departments||[]);
  if(roleDepartmentError) return res.status(400).json({error:roleDepartmentError});
  const passwordHash=await bcrypt.hash(b.password||'ChangeMe@123',12);
  const employeeNo=b.employee_no||`EMP-${String((await prisma.user.count())+1).padStart(4,'0')}`;
  const u=await prisma.$transaction(async (tx) => {
    const created=await tx.user.create({data:{employeeNo,fullName:b.full_name,email:b.email,passwordHash,roleId:role.id,isActive:toBool(b.is_active)}});
    if(Array.isArray(b.departments) && b.departments.length){
      const departments=await tx.department.findMany({where:{departmentName:{in:b.departments}}});
      if(departments.length) await tx.userDepartment.createMany({data:departments.map((department,index)=>({userId:created.id,departmentId:department.id,roleId:role.id,isPrimary:index===0})),skipDuplicates:true});
    }
    return created;
  });
  await writeAudit(req,{module:'USERS',action:'CREATE',recordId:u.id,newValues:{employee_no:u.employeeNo,full_name:u.fullName,email:u.email,role:role.roleName,departments:b.departments||[],is_active:u.isActive}});
  res.status(201).json({id:u.id});
}));
app.patch('/api/users/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'USERS.UPDATE'))) return;
  const b=req.body;
  const old=await prisma.user.findUnique({where:{id:req.params.id},include:{role:true,userDepartments:{include:{department:true}}}});
  if(!old) return res.status(404).json({error:'User not found'});
  const role=b.role_id
    ? await prisma.role.findUnique({where:{id:b.role_id}})
    : (b.role||b.role_code ? await prisma.role.findFirst({where:{OR:[{roleCode:b.role_code||''},{roleName:b.role||''}]}}) : old.role);
  if(!role) return res.status(400).json({error:'Choose a valid role'});
  const effectiveDepartments=Array.isArray(b.departments)?b.departments:old.userDepartments.map((item)=>item.department.departmentName);
  const roleDepartmentError=validateRoleDepartments(role.roleCode,effectiveDepartments);
  if(roleDepartmentError) return res.status(400).json({error:roleDepartmentError});
  const updated=await prisma.$transaction(async (tx) => {
    const user=await tx.user.update({where:{id:req.params.id},data:{employeeNo:b.employee_no,fullName:b.full_name,email:b.email,isActive:b.is_active,roleId:role.id}});
    if(Array.isArray(b.departments)){
      await tx.userDepartment.deleteMany({where:{userId:user.id}});
      if(b.departments.length){
        const departments=await tx.department.findMany({where:{departmentName:{in:b.departments}}});
        if(departments.length) await tx.userDepartment.createMany({data:departments.map((department,index)=>({userId:user.id,departmentId:department.id,roleId:role.id,isPrimary:index===0})),skipDuplicates:true});
      }
    } else if (old.roleId !== role.id) {
      await tx.userDepartment.updateMany({where:{userId:user.id},data:{roleId:role.id}});
    }
    return user;
  });
  await writeAudit(req,{module:'USERS',action:'UPDATE',recordId:updated.id,oldValues:{employee_no:old.employeeNo,full_name:old.fullName,email:old.email,role:old.role?.roleName||'',departments:old.userDepartments.map((item)=>item.department.departmentName),is_active:old.isActive},newValues:{employee_no:updated.employeeNo,full_name:updated.fullName,email:updated.email,role:role.roleName,departments:Array.isArray(b.departments)?b.departments:old.userDepartments.map((item)=>item.department.departmentName),is_active:updated.isActive}});
  res.json({id:updated.id});
}));

const collectDynamicFieldValues = (body = {}) => {
  const entries = [];
  const collect = (values) => {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return;
    for (const [fieldId, value] of Object.entries(values)) entries.push([fieldId, value]);
  };

  collect(body.general_data);
  collect(body.dynamic_data);
  for (const panel of (body.panel_instances || body.panels || [])) {
    collect(panel?.panel_data);
    for (const grid of panel?.separate_grids || []) collect(grid?.panel_data);
  }
  return entries;
};

async function validateDynamicMobileFields(tx, body = {}) {
  const entries = collectDynamicFieldValues(body);
  if (!entries.length) return;
  const valuesById = new Map(entries);
  const fieldIds = [...valuesById.keys()].filter((id) => UUID_PATTERN.test(String(id)));
  if (!fieldIds.length) return;
  const fields = await tx.formField.findMany({
    where:{ id:{ in:fieldIds } },
    select:{ id:true, fieldLabel:true, fieldKey:true, fieldType:true, configJson:true },
  });
  for (const field of fields) {
    const value = valuesById.get(field.id);
    if (value === null || value === undefined || value === '') continue;

    if (isMobileFieldName(`${field.fieldLabel || ''} ${field.fieldKey || ''}`)) {
      validateTenDigitMobile(value, field.fieldLabel || 'Mobile number');
    }

    if (field.fieldType === 'table' && value && typeof value === 'object') {
      const columns=field.configJson?.table_config?.columns || [];
      const headers=!Array.isArray(value) && value.headers ? value.headers : {};
      const rows=Array.isArray(value) ? value : (Array.isArray(value.rows) ? value.rows : []);
      for (const column of columns) {
        const label=headers[column.id] || column.name || '';
        if (!isMobileFieldName(label)) continue;
        for (const row of rows) {
          if (row?.[column.id] !== null && row?.[column.id] !== undefined && row?.[column.id] !== '') {
            validateTenDigitMobile(row[column.id], label || 'Mobile number');
          }
        }
      }
    }
  }
}


app.get('/api/inquiries/:id/pdf', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.VIEW'))) return;
  const model=await loadInquiryPdfModel(prisma,req.params.id);
  if(!model) return res.status(404).json({error:'Inquiry not found'});
  const pdf=buildInquiryPdf(model,{companyName:'Nexus Dashboard'});
  const fileName=buildInquiryPdfFileName(model);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`);
  res.setHeader('Content-Length',String(pdf.length));
  res.setHeader('Cache-Control','private, no-store');
  res.send(pdf);
}));

async function nextInquiryNo(tx) {
  const rows = await tx.inquiry.findMany({ select:{ inquiryNo:true } });
  let max = 0;
  for (const row of rows) {
    const value = String(row.inquiryNo || '');
    const exact = value.match(/^INQ-(\d+)$/i);
    const trailing = value.match(/(\d+)$/);
    if (exact) max = Math.max(max, Number(exact[1]) || 0);
    else if (trailing) max = Math.max(max, Number(trailing[1]) || 0);
  }
  return `INQ-${String(max + 1).padStart(4, '0')}`;
}

app.post('/api/inquiries', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.CREATE'))) return;
  const b=req.body;
  if(!b.inquiry_date) return res.status(400).json({error:'Select the Inquiry Start Date.'});
  const created=await prisma.$transaction(async (tx) => {
    const actor=await actorName(tx,req);
    await validateDynamicMobileFields(tx,b);
    const inquiryNo=await nextInquiryNo(tx);
    const activeMasterVersion=!b.master_version_id ? await tx.formVersion.findFirst({
      where:{isActive:true,formMaster:{formType:'INQUIRY'}},
      orderBy:{versionNo:'desc'},
    }) : null;
    const masterVersionId=b.master_version_id||activeMasterVersion?.id||null;
    const inquiry=await tx.inquiry.create({data:{inquiryNo,inquiryDate:b.inquiry_date?new Date(b.inquiry_date):undefined,customerId:b.customer_id,projectName:b.project_name,status:'New',qty:Number(b.qty||1),createdById:req.user?.id||null,uiData:{...b,inquiry_no:inquiryNo,status:'New',master_version_id:masterVersionId}}});
    const panelSources=Array.isArray(b.panel_instances) && b.panel_instances.length ? b.panel_instances : (Array.isArray(b.panels) ? b.panels : []);
    for (const p of panelSources) {
      const pm=await tx.panelMaster.findUnique({where:{id:p.panel_id||p.panel_master_id},include:{formMaster:{include:{versions:{where:{isActive:true},take:1}}}}});
      const formVersionId=p.panel_version_id || pm?.formMaster.versions[0]?.id;
      if(pm && formVersionId) await tx.inquiryPanel.create({data:{inquiryId:inquiry.id,panelMasterId:pm.id,formVersionId,panelNo:p.panel_no||'P-01',quantity:Number(p.qty||p.quantity||1),entryMode:p.details_mode||'common'}});
    }
    const customer=await tx.customer.findUnique({where:{id:inquiry.customerId},select:{customerName:true}});
    await createInquiryNotification(tx,req,{eventType:'INQUIRY_CREATED',inquiryId:inquiry.id,title:`New Inquiry Added - ${inquiry.inquiryNo}`,message:`${actor} created ${inquiry.inquiryNo}${customer?.customerName?` for ${customer.customerName}`:''}.`,payload:{status:'New'}});
    return inquiry;
  });
  await writeAudit(req,{module:'INQUIRIES',action:'CREATE',recordId:created.id,newValues:{...b,status:'New'}});
  res.status(201).json({id:created.id});
}));

app.patch('/api/inquiries/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.UPDATE'))) return;
  const b=req.body;
  if(!b.inquiry_date) return res.status(400).json({error:'Select the Inquiry Start Date.'});
  const old=await prisma.inquiry.findUnique({where:{id:req.params.id}});
  if(!old) return res.status(404).json({error:'Inquiry not found'});
  if(!(await requireInquiryEditScope(req,res,old))) return;
  if(b.status && b.status!==old.status) return res.status(400).json({error:'Use the inquiry status popup to change status.'});
  const currentUi=(old.uiData && typeof old.uiData==='object' && !Array.isArray(old.uiData)) ? old.uiData : {};
  const result=await prisma.$transaction(async (tx) => {
    const actor=await actorName(tx,req);
    await validateDynamicMobileFields(tx,b);
    const inquiry=await tx.inquiry.update({where:{id:req.params.id},data:{inquiryNo:b.inquiry_no,inquiryDate:b.inquiry_date?new Date(b.inquiry_date):undefined,customerId:b.customer_id,projectName:b.project_name,status:old.status,qty:b.qty?Number(b.qty):undefined,updatedById:req.user?.id||null,uiData:{...currentUi,...b,status:old.status}}});
    const panelSources=Array.isArray(b.panel_instances) && b.panel_instances.length ? b.panel_instances : (Array.isArray(b.panels) ? b.panels : []);
    for(const p of panelSources){
      const panelNo=p.panel_no||'P-01';
      const pm=await tx.panelMaster.findUnique({where:{id:p.panel_id||p.panel_master_id},include:{formMaster:{include:{versions:{where:{isActive:true},take:1}}}}});
      const formVersionId=p.panel_version_id || pm?.formMaster.versions[0]?.id;
      if(pm && formVersionId) await tx.inquiryPanel.upsert({where:{inquiryId_panelNo:{inquiryId:inquiry.id,panelNo}},update:{panelMasterId:pm.id,formVersionId,quantity:Number(p.qty||p.quantity||1),entryMode:p.details_mode||'common'},create:{inquiryId:inquiry.id,panelMasterId:pm.id,formVersionId,panelNo,quantity:Number(p.qty||p.quantity||1),entryMode:p.details_mode||'common'}});
    }
    await createInquiryNotification(tx,req,{eventType:'INQUIRY_UPDATED',inquiryId:inquiry.id,title:`Inquiry ${inquiry.inquiryNo} Updated`,message:`${actor} updated inquiry ${inquiry.inquiryNo}.`,payload:{status:inquiry.status}});
    return inquiry;
  });
  await writeAudit(req,{module:'INQUIRIES',action:'UPDATE',recordId:result.id,oldValues:{...currentUi,inquiry_no:old.inquiryNo,project_name:old.projectName,status:old.status,qty:old.qty},newValues:{...currentUi,...b,status:old.status}});
  res.json({id:result.id});
}));

app.get('/api/inquiries/:id/status-history', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.VIEW'))) return;
  const rows=await prisma.inquiryStatusHistory.findMany({
    where:{inquiryId:req.params.id},
    include:{
      changedBy:true,
      document:{include:{documentType:true}},
    },
    orderBy:{changedAt:'desc'}
  });
  res.json(rows.map((row)=>{
    const details=decodeStatusHistoryNote(row.note);
    const document=row.document?{
      id:row.document.id,
      original_file_name:row.document.originalFileName,
      document_type:row.document.documentType?.documentTypeName||'',
      version_no:row.document.versionNo,
    }:null;
    return {
      id:row.id,
      inquiry_id:row.inquiryId,
      from_status:row.fromStatus,
      to_status:row.toStatus,
      note:details.summary||details.note||'',
      reason:details.reason||'',
      additional_remark:details.additionalRemark||'',
      customer_comment:details.customerComment||'',
      internal_notes:details.internalNotes||'',
      revision_number:details.revisionNumber ?? null,
      version_label:details.versionLabel||'',
      remarks:details.remarks||'',
      dynamic_values:details.dynamicValues||{},
      dynamic_fields:Array.isArray(details.dynamicFields)?details.dynamicFields:[],
      changed_by:row.changedBy?.fullName||'System',
      changed_at:row.changedAt.toISOString(),
      documents:document?[{...document,role:'BOM',description:details.documentDescription||''}]:[],
      document,
    };
  }));
}));

const inquiryStatusUpload = upload.fields([
  { name:'attachments', maxCount:1 },
  { name:'bomAttachments', maxCount:1 },
]);

const ORDER_LOST_REASONS = ['Price','Commercial','Priority','Timing','Trust Issue','Certification'];
const HOLD_REASONS = ['Due to Customer','Specification','Technical','Commercial'];

const statusDetailSummary = ({toStatus,reason,additionalRemark,customerComment,internalNotes,remarks,versionLabel}) => {
  if(toStatus==='Order Lost') return [reason,additionalRemark].filter(Boolean).join(' · ');
  if(toStatus==='Inquiry Hold') return [reason,additionalRemark].filter(Boolean).join(' · ');
  if(toStatus==='BoM Approval Pending') return additionalRemark;
  if(toStatus==='Revision') return [customerComment&&`Customer: ${customerComment}`,internalNotes&&`Internal: ${internalNotes}`].filter(Boolean).join(' · ');
  if(toStatus==='Technical BoM Submitted') return [versionLabel,remarks].filter(Boolean).join(' · ');
  return [reason,additionalRemark].filter(Boolean).join(' · ');
};

const INQUIRY_STATUS_POPUP_STATUSES = new Set(['Technical BoM Submitted','BoM Approval Pending','Revision','Commercial BOM Submission','Order Won','Order Lost','Inquiry Hold']);

const encodeStatusHistoryNote = (details = {}) => JSON.stringify({ nexusStatusDetails:1, ...details });
const decodeStatusHistoryNote = (value) => {
  if(!value) return {};
  try {
    const parsed=JSON.parse(value);
    if(parsed && parsed.nexusStatusDetails===1) return parsed;
  } catch {}
  return { note:String(value), summary:String(value) };
};

const updateInquiryStatus = asyncRoute(async (req,res) => {
  const supportingFiles=req.files?.attachments || [];
  const bomFiles=req.files?.bomAttachments || [];
  const allFiles=[...supportingFiles,...bomFiles];
  let filesCommitted=false;
  const reject=(status,error)=>{ cleanupUploads(allFiles); return res.status(status).json({error}); };

  try {
    if(!(await requireEffectivePermission(req,res,'INQUIRIES.STATUS_CHANGE'))) { cleanupUploads(allFiles); return; }

    const inquiry=await prisma.inquiry.findUnique({where:{id:req.params.id}});
    if(!inquiry) return reject(404,'Inquiry not found');
    if(!(await requireInquiryWriteScope(req,res,inquiry))) { cleanupUploads(allFiles); return; }

    const toStatus=String(req.body.to_status || req.body.status || '').trim();
    if(toStatus==='Order Won' && req.body.kickoff_meeting && !(await hasEffectivePermission(req.user?.id,'INQUIRIES.KICKOFF'))) {
      return reject(403,'You do not have permission to schedule the kickoff meeting.');
    }
    const statusRows=await activeInquiryStatusRows(prisma);
    const statusMaster=statusRows.find((row)=>row.statusName===toStatus);
    if(!statusMaster) return reject(400,'Choose a valid active inquiry status.');
    if(toStatus===inquiry.status) return reject(400,'Choose a different status.');
    // Keep every active Inquiry Status available even after project conversion.
    // Project lock/unlock behavior is still driven by the selected inquiry status.
    const linkedProject=await prisma.project.findFirst({where:{inquiryId:inquiry.id},select:{id:true}});

    const commonReasonInput=String(req.body.reason || '').trim();
    const orderLostReasonInput=String(req.body.order_lost_reason || req.body.orderLostReason || commonReasonInput || '').trim();
    const orderLostAdditionalRemark=String(req.body.order_lost_additional_remark || req.body.orderLostAdditionalRemark || '').trim();
    const holdReasonInput=String(req.body.hold_reason || req.body.holdReason || commonReasonInput || '').trim();
    const holdAdditionalRemark=String(req.body.hold_additional_remark || req.body.holdAdditionalRemark || '').trim();
    const bomApprovalAdditionalRemark=String(req.body.bom_approval_additional_remark || req.body.bomApprovalAdditionalRemark || '').trim();
    const revisionCustomerComment=String(req.body.revision_customer_comment || req.body.revisionCustomerComment || '').trim();
    const revisionInternalNotes=String(req.body.revision_internal_notes || req.body.revisionInternalNotes || '').trim();
    const bomSubmissionRemarks=String(req.body.bom_submission_remarks || req.body.bomSubmissionRemarks || '').trim();
    const genericReason=String(req.body.generic_reason || req.body.genericReason || '').trim();
    const genericRemark=String(req.body.generic_remark || req.body.genericRemark || '').trim();
    let dynamicValues={};
    if(req.body.dynamic_values){
      try {
        const parsed=typeof req.body.dynamic_values==='string' ? JSON.parse(req.body.dynamic_values) : req.body.dynamic_values;
        if(parsed && typeof parsed==='object' && !Array.isArray(parsed)) dynamicValues=parsed;
      } catch { return reject(400,'Status popup data is invalid.'); }
    }

    const hasStatusSpecificPayload=[orderLostReasonInput,orderLostAdditionalRemark,holdReasonInput,holdAdditionalRemark,bomApprovalAdditionalRemark,revisionCustomerComment,revisionInternalNotes,bomSubmissionRemarks,genericReason,genericRemark,String(req.body.kickoff_meeting||'').trim(),Object.keys(dynamicValues).length].some(Boolean);
    // IMPORTANT: built-in popup statuses (especially Order Lost / Inquiry Hold)
    // have their own dedicated payload and validation. A built-in status may also
    // be configured with behavior=REASON in the status master; that must NOT make
    // it enter the generic-reason validation path. Otherwise the backend asks for
    // generic_reason even though the UI correctly submits order_lost_reason or
    // hold_reason, producing the false "Select a valid reason" error.
    const isBuiltInPopupStatus=INQUIRY_STATUS_POPUP_STATUSES.has(toStatus);
    const customReasonPopup=!isBuiltInPopupStatus && (statusMaster.behavior==='REASON' || statusMaster.requiresPopup);
    if(!isBuiltInPopupStatus && !customReasonPopup && hasStatusSpecificPayload) return reject(400,`No additional status details are allowed for ${toStatus}.`);

    const normalizeOption=(value)=>String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
    const canonicalOption=(value,options=[])=>{
      const token=normalizeOption(value);
      if(!token) return '';
      const match=options.find((option)=>normalizeOption(option)===token);
      return match===undefined ? '' : String(match).trim();
    };
    const configuredSystemReasons=Array.isArray(statusMaster.reasonOptions)
      ? statusMaster.reasonOptions.map((value)=>String(value ?? '').trim()).filter(Boolean)
      : [];
    const orderLostAllowed=toStatus==='Order Lost' && configuredSystemReasons.length ? configuredSystemReasons : ORDER_LOST_REASONS;
    const holdAllowed=toStatus==='Inquiry Hold' && configuredSystemReasons.length ? configuredSystemReasons : HOLD_REASONS;
    // Built-in Order Lost / Inquiry Hold are dropdown-driven in the UI. Accept the
    // selected non-empty value even if older master data contains a slightly
    // different reason list. If it matches the configured list, store the
    // canonical configured spelling; otherwise preserve the selected value.
    // This avoids false "Select a valid reason" errors caused by stale master
    // rows while still rejecting an empty selection.
    const orderLostReason=toStatus==='Order Lost'
      ? (canonicalOption(orderLostReasonInput,orderLostAllowed) || orderLostReasonInput)
      : orderLostReasonInput;
    const holdReason=toStatus==='Inquiry Hold'
      ? (canonicalOption(holdReasonInput,holdAllowed) || holdReasonInput)
      : holdReasonInput;
    if(toStatus==='Order Lost' && !orderLostReason) return reject(400,'Select the Order Lost reason.');
    if(toStatus==='Inquiry Hold' && !holdReason) return reject(400,'Select the Inquiry Hold reason.');
    if(customReasonPopup){
      const options=Array.isArray(statusMaster.reasonOptions)?statusMaster.reasonOptions.filter(Boolean):[];
      if(options.length && !canonicalOption(genericReason,options)) return reject(400,`Select a valid reason for ${toStatus}.`);
      if(statusMaster.requiresPopup && !genericReason && options.length) return reject(400,`Select a reason for ${toStatus}.`);
    }
    const popupFields=Array.isArray(statusMaster.popupFields)?statusMaster.popupFields:[];
    for(const field of popupFields){
      const key=String(field.key||field.id||'').trim();
      if(!key) continue;
      const value=dynamicValues[key];
      const missing=Array.isArray(value) ? value.length===0 : value===undefined || value===null || String(value).trim()==='';
      if(field.required && missing) return reject(400,`${field.label || 'Status field'} is required.`);
      if(field.type==='dropdown' && !missing && Array.isArray(field.options) && field.options.length && !canonicalOption(value,field.options)) return reject(400,`Choose a valid value for ${field.label || 'status field'}.`);
    }

    // Exact old workflow: there is no generic "supporting document" upload on status changes.
    // Reject it server-side as well so a handcrafted API request cannot bypass the UI.
    const hasSupportingPayload = supportingFiles.length > 0 ||
      String(req.body.attachment_document_type_id || '').trim() ||
      String(req.body.attachment_description || '').trim();
    if(hasSupportingPayload) return reject(400,'Supporting documents are not allowed for inquiry status changes.');

    const statusesAllowingBom = new Set(['Technical BoM Submitted','Revision','Commercial BOM Submission','Order Won']);
    const statusesRequiringBom = new Set(['Technical BoM Submitted','Revision','Commercial BOM Submission']);
    if(bomFiles.length && !statusesAllowingBom.has(toStatus)) {
      return reject(400,`Documents are not allowed when changing inquiry status to ${toStatus}.`);
    }
    if(statusesRequiringBom.has(toStatus) && bomFiles.length !== 1) {
      return reject(400,`Exactly one ${toStatus==='Commercial BOM Submission'?'Commercial':'Technical'} BOM document is required for this status.`);
    }
    if(bomFiles.length > 1) return reject(400,'Only one Technical BoM document can be uploaded per status change.');

    let bomType=null;
    if(bomFiles.length){
      const id=String(req.body.bom_document_type_id||'').trim();
      const expectedKind=toStatus==='Commercial BOM Submission'?'Commercial':'Technical';
      if(!id) return reject(400,`Choose the ${expectedKind} BOM document subtype.`);
      bomType=await prisma.documentType.findUnique({where:{id}});
      if(!bomType || !bomType.isActive) return reject(400,'Selected document type is invalid or inactive.');
      if(bomType.parentDocumentTypeId){
        const parent=await prisma.documentType.findUnique({where:{id:bomType.parentDocumentTypeId}});
        bomType={...bomType,parent};
      }
      const validType=toStatus==='Commercial BOM Submission' ? isCommercialBomDocumentType(bomType) : isTechnicalBomDocumentType(bomType);
      if(!validType) return reject(400,`Only a ${expectedKind} BOM document subtype is allowed for this status.`);
    } else if (String(req.body.bom_document_type_id||'').trim()) {
      return reject(400,'A document type cannot be submitted without an allowed document file.');
    }

    let kickoff=null;
    if(req.body.kickoff_meeting){
      try {
        kickoff = typeof req.body.kickoff_meeting === 'string'
          ? JSON.parse(req.body.kickoff_meeting)
          : req.body.kickoff_meeting;
        if(!kickoff || typeof kickoff !== 'object' || Array.isArray(kickoff)) throw new Error('invalid kickoff');
      } catch {
        return reject(400,'Kickoff meeting data is invalid.');
      }
    }
    const existingKickoff=await prisma.meeting.findFirst({where:{inquiryId:inquiry.id,meetingType:'KICKOFF'}});
    let kickoffUserIds=[];
    if(toStatus==='Order Won'){
      if(!existingKickoff && !kickoff) return reject(400,'Enter the kickoff meeting details before changing the inquiry to Order Won.');
      if(kickoff){
        if(!kickoff.meeting_date || !kickoff.start_time || !kickoff.end_time) return reject(400,'Kickoff meeting date, start time and end time are required.');
        if(String(kickoff.end_time).slice(0,5) <= String(kickoff.start_time).slice(0,5)) return reject(400,'Kickoff meeting end time must be later than start time.');
        kickoffUserIds=[...new Set((kickoff.user_ids||[]).filter(Boolean))];
        if(!kickoffUserIds.length) return reject(400,'Assign at least one user to the kickoff meeting.');
        const validUsers=await prisma.user.findMany({where:{id:{in:kickoffUserIds},isActive:true},select:{id:true}});
        if(validUsers.length!==kickoffUserIds.length) return reject(400,'One or more kickoff users are invalid or inactive.');
      }
    }

    let revisionNumber=null;
    let versionLabel='';
    if(bomFiles.length && ['Technical BoM Submitted','Revision'].includes(toStatus)){
      const previousBomVersions=await prisma.inquiryStatusHistory.count({where:{inquiryId:inquiry.id,toStatus:{in:['Technical BoM Submitted','Revision']},documentId:{not:null}}});
      revisionNumber=previousBomVersions;
      versionLabel=revisionNumber===0 ? 'Revision - 0' : `v${revisionNumber}`;
    }

    const reason=toStatus==='Order Lost'?orderLostReason:toStatus==='Inquiry Hold'?holdReason:customReasonPopup?genericReason:'';
    const additionalRemark=toStatus==='Order Lost'?orderLostAdditionalRemark:toStatus==='Inquiry Hold'?holdAdditionalRemark:toStatus==='BoM Approval Pending'?bomApprovalAdditionalRemark:customReasonPopup?genericRemark:'';
    const customerComment=toStatus==='Revision'?revisionCustomerComment:'';
    const internalNotes=toStatus==='Revision'?revisionInternalNotes:'';
    const remarks=toStatus==='Technical BoM Submitted'?bomSubmissionRemarks:'';
    const note=statusDetailSummary({toStatus,reason,additionalRemark,customerComment,internalNotes,remarks,versionLabel});
    const currentUi=(inquiry.uiData && typeof inquiry.uiData==='object' && !Array.isArray(inquiry.uiData)) ? inquiry.uiData : {};

    const result=await prisma.$transaction(async (tx) => {
      const history=await tx.inquiryStatusHistory.create({data:{
        inquiryId:inquiry.id,
        fromStatus:inquiry.status,
        toStatus,
        note:encodeStatusHistoryNote({
          summary:note||'',
          reason:reason||'',
          additionalRemark:additionalRemark||'',
          customerComment:customerComment||'',
          internalNotes:internalNotes||'',
          revisionNumber,
          versionLabel:versionLabel||'',
          remarks:remarks||'',
          documentDescription:toStatus==='Order Won'?'Final Technical BoM':bomSubmissionRemarks,
          dynamicValues,
          dynamicFields:Array.isArray(statusMaster.popupFields)?statusMaster.popupFields:[],
        }),
        changedById:req.user?.id||null,
      }});

      const createdDocuments=[];
      const createStatusDocument=async(file,type,role,description,versionNo=1)=>{
        const checksum=crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
        const displayName=documentDisplayName(req.body.bom_document_name,file.originalname);
        const doc=await tx.document.create({data:{documentTypeId:type.id,fileName:file.filename,originalFileName:displayName,storagePath:file.path,mimeType:file.mimetype,fileSize:BigInt(file.size),versionNo,checksum,uploadedById:req.user?.id||null}});
        await tx.inquiryDocument.create({data:{inquiryId:inquiry.id,documentId:doc.id,description:description||null}});
        createdDocuments.push(doc);
      };

      for(const file of bomFiles) await createStatusDocument(file,bomType,'BOM',toStatus==='Order Won'?'Final Technical BoM':toStatus==='Commercial BOM Submission'?'Commercial BOM':bomSubmissionRemarks,toStatus==='Commercial BOM Submission'?1:(revisionNumber ?? 0));
      if(createdDocuments.length) await tx.inquiryStatusHistory.update({where:{id:history.id},data:{documentId:createdDocuments[0].id}});

      const revisionUi = revisionNumber !== null ? { current_revision_number:revisionNumber, current_revision_label:`Revision ${revisionNumber}` } : {};
      const amendmentActive=toStatus==='Order Won'
        ? false
        : Boolean(linkedProject && (inquiry.status==='Order Won' || currentUi.amendment_active));
      const updated=await tx.inquiry.update({where:{id:inquiry.id},data:{status:toStatus,updatedById:req.user?.id||null,uiData:{...currentUi,status:toStatus,amendment_active:amendmentActive,...revisionUi}}});

      let kickoffMeeting=existingKickoff;
      if(toStatus==='Order Won' && kickoff){
        const meetingData={
          inquiryId:inquiry.id,
          projectId:null,
          meetingType:'KICKOFF',
          title:`Kickoff Meeting - ${inquiry.inquiryNo}`,
          agenda:String(kickoff.agenda||'').trim()||null,
          meetingDate:new Date(kickoff.meeting_date),
          startTime:meetingTimeDate(kickoff.start_time),
          endTime:kickoff.end_time?meetingTimeDate(kickoff.end_time):null,
          location:String(kickoff.location||'').trim()||null,
          meetingLink:String(kickoff.meeting_link||'').trim()||null,
        };
        if(existingKickoff){
          await tx.meetingUser.deleteMany({where:{meetingId:existingKickoff.id}});
          kickoffMeeting=await tx.meeting.update({where:{id:existingKickoff.id},data:{...meetingData,attendees:{create:kickoffUserIds.map((userId)=>({userId}))}}});
          await createMeetingNotification(tx,req,kickoffMeeting,kickoffUserIds,'KICKOFF_MEETING_UPDATED');
        }else{
          kickoffMeeting=await tx.meeting.create({data:{...meetingData,createdById:req.user?.id||null,attendees:{create:kickoffUserIds.map((userId)=>({userId}))}}});
          await createMeetingNotification(tx,req,kickoffMeeting,kickoffUserIds,'KICKOFF_MEETING_CREATED');
        }
      }

      const actor=await actorName(tx,req);
      await createInquiryNotification(tx,req,{
        eventType:'INQUIRY_STATUS_CHANGED',
        inquiryId:inquiry.id,
        title:`Inquiry ${inquiry.inquiryNo} Status Changed`,
        message:`${actor} changed ${inquiry.inquiryNo} from ${inquiry.status} to ${toStatus}.${note?` ${note}`:''}`,
        payload:{from_status:inquiry.status,to_status:toStatus,status_history_id:history.id,document_ids:createdDocuments.map((doc)=>doc.id),kickoff_meeting_id:kickoffMeeting?.id||null},
      });
      return {updated,history,createdDocuments,kickoffMeeting};
    });

    filesCommitted=true;
    await writeAudit(req,{module:'INQUIRIES',action:'STATUS_CHANGE',recordId:inquiry.id,oldValues:{status:inquiry.status},newValues:{status:toStatus,reason,additional_remark:additionalRemark,customer_comment:customerComment,internal_notes:internalNotes,revision_number:revisionNumber,version_label:versionLabel,remarks,document_ids:result.createdDocuments.map((doc)=>doc.id),kickoff_meeting_id:result.kickoffMeeting?.id||null}});
    res.json({id:result.updated.id,status:result.updated.status,status_history_id:result.history.id,revision_number:revisionNumber,version_label:versionLabel,document_ids:result.createdDocuments.map((doc)=>doc.id),kickoff_meeting_id:result.kickoffMeeting?.id||null});
  } catch(error) {
    if(!filesCommitted) cleanupUploads(allFiles);
    throw error;
  }
});

app.post('/api/inquiries/:id/status', inquiryStatusUpload, updateInquiryStatus);
app.patch('/api/inquiries/:id/status', inquiryStatusUpload, updateInquiryStatus);


const kickoffCompletionAt = (meeting) => {
  if (!meeting?.meetingDate || !meeting?.startTime || !meeting?.endTime) return null;
  const date = new Date(meeting.meetingDate);
  const time = new Date(meeting.endTime);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.getUTCHours(),
    time.getUTCMinutes(),
    time.getUTCSeconds(),
    0,
  );
};

const kickoffIsReady = (meeting) => {
  const completion = kickoffCompletionAt(meeting);
  return !!completion && Date.now() >= completion.getTime();
};

async function nextProjectNo(tx) {
  const rows = await tx.project.findMany({ select:{ projectNo:true } });
  let max = 0;
  for (const row of rows) {
    const value=String(row.projectNo || '');
    const napl=value.match(/^NAPL-(\d+)$/i);
    const trailing=value.match(/(\d+)$/);
    if (napl) max = Math.max(max, Number(napl[1]) || 0);
    else if (trailing) max = Math.max(max, Number(trailing[1]) || 0);
  }
  return `NAPL-${String(max + 1).padStart(4, '0')}`;
}

app.get('/api/inquiries/:id/kickoff', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.VIEW'))) return;
  const inquiry = await prisma.inquiry.findUnique({
    where:{ id:req.params.id },
    include:{ meetings:{ where:{ meetingType:'KICKOFF' }, include:meetingInclude, orderBy:{ createdAt:'desc' }, take:1 }, projects:{ take:1, orderBy:{ createdAt:'desc' } } },
  });
  if(!inquiry) return res.status(404).json({error:'Inquiry not found'});
  const meeting = inquiry.meetings?.[0] || null;
  const project = inquiry.projects?.[0] || null;
  res.json({
    inquiry_id:inquiry.id,
    inquiry_no:inquiry.inquiryNo,
    meeting:meeting ? serializeMeeting(meeting) : null,
    ready_for_completion:meeting ? kickoffIsReady(meeting) : false,
    project_created:!!project,
    project_id:project?.id || null,
    project_no:project?.projectNo || '',
  });
}));

app.put('/api/inquiries/:id/kickoff', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.KICKOFF'))) return;
  const inquiry = await prisma.inquiry.findUnique({ where:{id:req.params.id} });
  if(!inquiry) return res.status(404).json({error:'Inquiry not found'});
  if(!(await requireInquiryWriteScope(req,res,inquiry))) return;
  if(inquiry.status!=='Order Won') return res.status(400).json({error:'Kick-off Meeting can be edited only while the inquiry is Order Won.'});
  const existing = await prisma.meeting.findFirst({ where:{inquiryId:inquiry.id,meetingType:'KICKOFF'}, include:meetingInclude });
  if(!existing) return res.status(404).json({error:'Kick-off Meeting not found'});
  const existingProject = await prisma.project.findFirst({ where:{inquiryId:inquiry.id}, select:{id:true} });
  if(existingProject || String(existing.status).toLowerCase()==='completed') return res.status(409).json({error:'Kick-off Meeting is already completed and cannot be edited.'});

  const b=req.body || {};
  if(!b.meeting_date || !b.start_time || !b.end_time) return res.status(400).json({error:'Kick-off date, start time and end time are required.'});
  if(String(b.end_time).slice(0,5) <= String(b.start_time).slice(0,5)) return res.status(400).json({error:'Kick-off end time must be later than start time.'});
  const userIds=[...new Set((b.user_ids || []).filter(Boolean))];
  if(!userIds.length) return res.status(400).json({error:'Assign at least one user to the kick-off meeting.'});
  const validUsers=await prisma.user.findMany({where:{id:{in:userIds},isActive:true},select:{id:true}});
  if(validUsers.length!==userIds.length) return res.status(400).json({error:'One or more kick-off users are invalid or inactive.'});

  const updated = await prisma.$transaction(async(tx)=>{
    await tx.meetingUser.deleteMany({where:{meetingId:existing.id}});
    const meeting=await tx.meeting.update({
      where:{id:existing.id},
      data:{
        title:`Kickoff Meeting - ${inquiry.inquiryNo}`,
        agenda:String(b.agenda || '').trim() || null,
        meetingDate:new Date(b.meeting_date),
        startTime:meetingTimeDate(b.start_time),
        endTime:b.end_time?meetingTimeDate(b.end_time):null,
        location:String(b.location || '').trim() || null,
        meetingLink:String(b.meeting_link || '').trim() || null,
        status:'Scheduled',
        attendees:{create:userIds.map((userId)=>({userId}))},
      },
    });
    await createMeetingNotification(tx,req,meeting,userIds,'KICKOFF_MEETING_UPDATED');
    return meeting;
  });
  await writeAudit(req,{module:'MEETINGS',action:'UPDATE',recordId:updated.id,oldValues:serializeMeeting(existing),newValues:b});
  const full=await prisma.meeting.findUnique({where:{id:updated.id},include:meetingInclude});
  res.json(serializeMeeting(full));
}));

app.post('/api/inquiries/:id/kickoff/complete', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRIES.CONVERT_TO_PROJECT'))) return;
  const inquiry = await prisma.inquiry.findUnique({
    where:{id:req.params.id},
    include:{
      customer:true,
      panels:{include:{panelMaster:true}},
      meetings:{where:{meetingType:'KICKOFF'},include:meetingInclude,orderBy:{createdAt:'desc'},take:1},
      documents:{where:{isActive:true}},
      projects:{take:1,orderBy:{createdAt:'desc'}},
    },
  });
  if(!inquiry) return res.status(404).json({error:'Inquiry not found'});
  if(!(await requireInquiryWriteScope(req,res,inquiry))) return;
  if(inquiry.projects?.[0]) {
    const existing=inquiry.projects[0];
    return res.json({project_id:existing.id,project_no:existing.projectNo,already_created:true});
  }
  if(inquiry.status!=='Order Won') return res.status(400).json({error:'Only an Order Won inquiry can be converted to a Project.'});
  const kickoff=inquiry.meetings?.[0];
  if(!kickoff) return res.status(400).json({error:'Schedule the Kick-off Meeting first.'});
  if(!kickoffIsReady(kickoff)) return res.status(400).json({error:'Kickoff Meeting Done is available only after the kick-off meeting end time.'});

  const actor=await actorName(prisma,req);
  const currentUi=(inquiry.uiData && typeof inquiry.uiData==='object' && !Array.isArray(inquiry.uiData)) ? inquiry.uiData : {};
  const panelRows=(inquiry.panels || []).map((panel)=>({
    panel_id:panel.panelMasterId,
    panel_master_id:panel.panelMasterId,
    panel_no:panel.panelNo,
    panel:panel.panelMaster?.panelType || '',
    panel_type:panel.panelMaster?.panelType || '',
    qty:panel.quantity || 1,
    planning_mode:(panel.quantity || 1)>1?'common':'common',
    planning_groups:[],
  }));

  const created=await prisma.$transaction(async(tx)=>{
    const duplicate=await tx.project.findFirst({where:{inquiryId:inquiry.id}});
    if(duplicate) return duplicate;
    const projectNo=await nextProjectNo(tx);
    const [activeProjectVersion,activePlanningVersion]=await Promise.all([
      tx.formVersion.findFirst({where:{isActive:true,formMaster:{formType:'PROJECT'}},orderBy:{versionNo:'desc'}}),
      tx.planningGridVersion.findFirst({where:{isActive:true},orderBy:{versionNo:'desc'}}),
    ]);
    const kickoffSnapshot=serializeMeeting(kickoff);
    const projectUi={
      project_no:projectNo,
      inquiry_id:inquiry.id,
      source_inquiry:inquiry.inquiryNo,
      customer_id:inquiry.customerId,
      customer:inquiry.customer?.customerName || '',
      project_name:inquiry.projectName,
      quantity:inquiry.qty || 1,
      project_quantity:inquiry.qty || 1,
      status:'Planning',
      progress:0,
      created_at:new Date().toISOString().slice(0,10),
      created_by:actor,
      order_date:new Date().toISOString().slice(0,10),
      order_expected_end_date:currentUi.order_expected_end_date || '',
      departments:[],
      assignments:[],
      panels:panelRows,
      planning_grid:[],
      project_master_version_id:activeProjectVersion?.id||null,
      planning_grid_version_id:activePlanningVersion?.id||null,
      kickoff_meeting:kickoffSnapshot,
    };
    const project=await tx.project.create({data:{projectNo,inquiryId:inquiry.id,customerId:inquiry.customerId,projectName:inquiry.projectName,status:'Planning',progress:0,createdById:req.user?.id||null,uiData:projectUi}});
    if(inquiry.documents?.length){
      await tx.projectDocument.createMany({
        data:inquiry.documents.map((link)=>({projectId:project.id,documentId:link.documentId,description:link.description||null,isActive:true})),
        skipDuplicates:true,
      });
    }
    await tx.meeting.update({where:{id:kickoff.id},data:{status:'Completed'}});
    await tx.inquiry.update({where:{id:inquiry.id},data:{updatedById:req.user?.id||null,uiData:{...currentUi,status:'Order Won',converted_to_project:true,project_id:project.id,project_no:projectNo,kickoff_status:'Completed'}}});
    await createInquiryNotification(tx,req,{
      eventType:'PROJECT_CREATED_AFTER_KICKOFF',
      inquiryId:inquiry.id,
      title:`Project Created After Kick-off Meeting - ${projectNo}`,
      message:`${actor} marked the Kick-off Meeting done and created ${projectNo} from ${inquiry.inquiryNo}.`,
      payload:{project_id:project.id,project_no:projectNo,kickoff_meeting_id:kickoff.id},
    });
    await createProjectNotification(tx,req,{
      eventType:'PROJECT_CREATED',
      project,
      title:`Project Created - ${projectNo}`,
      message:`${project.projectName} was created from ${inquiry.inquiryNo} after the Kick-off Meeting.`,
      payload:{project_no:projectNo,project_name:project.projectName,inquiry_no:inquiry.inquiryNo,kickoff_meeting_id:kickoff.id},
      userIds:await activeUserIds(tx),
    });
    return project;
  }, { isolationLevel:'Serializable' });

  await writeAudit(req,{module:'INQUIRIES',action:'KICKOFF_COMPLETE',recordId:inquiry.id,oldValues:{kickoff_status:kickoff.status,project_id:null},newValues:{kickoff_status:'Completed',project_id:created.id,project_no:created.projectNo}});
  res.status(201).json({project_id:created.id,project_no:created.projectNo,created:true});
}));

const timesheetInclude = { project:true, ticket:true, department:true, assignedUser:true, createdBy:true };
const dateOnlyOrBlank = (value) => value ? new Date(value).toISOString().slice(0,10) : '';
const serializeTimesheetTask = (row) => ({
  id:row.id,
  title:row.title,
  description:row.description || '',
  task_source:row.taskSource,
  source_task_key:row.sourceTaskKey || '',
  project_id:row.projectId || null,
  project_no:row.project?.projectNo || '',
  project_name:row.project?.projectName || '',
  ticket_id:row.ticketId || null,
  ticket_no:row.ticket?.ticketNo || '',
  department_id:row.departmentId || null,
  department:row.department?.departmentName || '',
  assigned_user_id:row.assignedUserId,
  assigned_to:row.assignedUser?.fullName || '',
  created_by_id:row.createdById || null,
  created_by:row.createdBy?.fullName || 'System',
  start_date:dateOnlyOrBlank(row.startDate),
  due_date:dateOnlyOrBlank(row.dueDate),
  actual_end_date:dateOnlyOrBlank(row.actualEndDate),
  status:row.status,
  priority:row.priority,
  task_type:row.taskType || 'Other',
  estimated_hours:Number(row.estimatedHours || 0),
  actual_hours:Number(row.actualHours || 0),
  start_time:row.startTime || '',
  end_time:row.endTime || '',
  remarks:row.remarks || '',
  is_archived:row.isArchived,
  created_at:row.createdAt.toISOString(),
  updated_at:row.updatedAt.toISOString(),
});

const parseDateOnly = (value) => value ? new Date(`${String(value).slice(0,10)}T00:00:00.000Z`) : null;

async function userScope(userId) {
  return prisma.user.findUnique({
    where:{id:userId},
    include:{role:true,userDepartments:{include:{department:true}}},
  });
}

async function timesheetScopeWhere(req, requestedScope='self', master=false) {
  const user=await userScope(req.user?.id);
  if(!user) return { id:{ equals:'00000000-0000-0000-0000-000000000000' } };
  const role=String(user.role?.roleCode||'').toUpperCase();

  // SELF always means the logged-in user's own tasks, even for Admin.
  // ADMIN Team/Master is company-wide and must not depend on an explicitly
  // seeded TIMESHEET.TEAM_VIEW permission or department membership.
  if(role==='ADMIN'){
    if(master || requestedScope==='team' || requestedScope==='all') return {};
    return { assignedUserId:user.id };
  }

  if(requestedScope==='team' || master){
    const permission=master?'TIMESHEET_MASTER.VIEW':'TIMESHEET.TEAM_VIEW';
    if(!(await hasEffectivePermission(user.id,permission))) return { assignedUserId:user.id };
    const departmentIds=user.userDepartments.map((item)=>item.departmentId);
    return departmentIds.length ? { departmentId:{in:departmentIds} } : { assignedUserId:user.id };
  }
  return { assignedUserId:user.id };
}

// Archive/Unarchive is available to every Timesheet user for their own
// tasks, and for their team's tasks (same department), independent of the
// stricter TIMESHEET.ASSIGN / TIMESHEET_MASTER.UPDATE edit permissions.
async function canArchiveTimesheetTask(req, task) {
  if (!req.user?.id || !task) return false;
  if (await hasEffectivePermission(req.user.id,'TIMESHEET_MASTER.DELETE')) return true;
  if (task.assignedUserId===req.user.id && await hasEffectivePermission(req.user.id,'TIMESHEET.VIEW')) return true;
  if (task.departmentId && await hasEffectivePermission(req.user.id,'TIMESHEET.TEAM_VIEW')) {
    const user=await userScope(req.user.id);
    const departmentIds=new Set((user?.userDepartments||[]).map((row)=>row.departmentId));
    if (String(user?.role?.roleCode||'').toUpperCase()==='ADMIN' || departmentIds.has(task.departmentId)) return true;
  }
  return false;
}

async function syncProjectTimesheetTasks(tx, project, uiData, actorId) {
  const rows=Array.isArray(uiData?.planning_grid)?uiData.planning_grid:[];
  const activeRows=rows.filter((row)=>String(row.assigned_to||'').trim() && String(row.task||'').trim());
  const names=[...new Set(activeRows.map((row)=>String(row.assigned_to).trim()))];
  const departments=[...new Set(activeRows.map((row)=>String(row.department||'').trim()).filter(Boolean))];
  const [users,depts]=await Promise.all([
    names.length?tx.user.findMany({where:{fullName:{in:names},isActive:true}}):[],
    departments.length?tx.department.findMany({where:{departmentName:{in:departments}}}):[],
  ]);
  const userByName=new Map(users.map((user)=>[user.fullName,user]));
  const deptByName=new Map(depts.map((dept)=>[dept.departmentName,dept]));
  const sourceKeys=[];
  for(let index=0;index<activeRows.length;index+=1){
    const row=activeRows[index];
    const assigned=userByName.get(String(row.assigned_to).trim());
    if(!assigned) continue;
    const sourceTaskKey=String(row.id||`${row.panel_key||row.panel||'general'}:${row.department||'general'}:${row.task||index}`).slice(0,180);
    sourceKeys.push(sourceTaskKey);
    const department=deptByName.get(String(row.department||'').trim());
    const data={
      title:String(row.task||'Project Task').slice(0,220),
      description:[row.panel,row.remark].filter(Boolean).join(' · ') || null,
      taskSource:'PROJECT',
      projectId:project.id,
      sourceTaskKey,
      departmentId:department?.id || null,
      assignedUserId:assigned.id,
      createdById:actorId || project.createdById || null,
      startDate:parseDateOnly(row.start_date||row.planned_start),
      dueDate:parseDateOnly(row.expected_end_date||row.planned_end),
      actualEndDate:parseDateOnly(row.actual_end_date||row.actual_end),
      status:(()=>{const x=String(row.status||'Planned');return x==='Pending'?'Planned':x;})(),
      priority:String(row.priority||'Medium'),
      taskType:String(row.task_type||row.taskType||'Other'),
      remarks:String(row.remark||row.remarks||'').trim()||null,
    };
    await tx.timesheetTask.upsert({
      where:{projectId_sourceTaskKey:{projectId:project.id,sourceTaskKey}},
      update:{...data,isArchived:false},
      create:data,
    });
  }
  await tx.timesheetTask.updateMany({
    where:{projectId:project.id,taskSource:'PROJECT',...(sourceKeys.length?{sourceTaskKey:{notIn:sourceKeys}}:{})},
    data:{isArchived:true},
  });
}

async function reverseSyncTimesheetStatus(tx, task) {
  if(task.taskSource!=='PROJECT' || !task.projectId || !task.sourceTaskKey) return;
  const project=await tx.project.findUnique({where:{id:task.projectId}});
  const ui=project?.uiData && typeof project.uiData==='object' && !Array.isArray(project.uiData) ? project.uiData : {};
  const rows=Array.isArray(ui.planning_grid)?ui.planning_grid:[];
  let changed=false;
  const nextRows=rows.map((row)=>{
    if(String(row.id||'')!==String(task.sourceTaskKey)) return row;
    changed=true;
    const completed=task.status==='Completed';
    return {...row,status:task.status,progress:completed?100:(Number(row.progress||0)),actual_end_date:dateOnlyOrBlank(task.actualEndDate)||row.actual_end_date||'',actual_end:dateOnlyOrBlank(task.actualEndDate)||row.actual_end||''};
  });
  if(changed){
    const completed=nextRows.filter((row)=>row.status==='Completed').length;
    const progress=nextRows.length?Math.round((completed/nextRows.length)*100):0;
    await tx.project.update({where:{id:project.id},data:{progress,uiData:{...ui,progress,planning_grid:nextRows}}});
  }
}

app.post('/api/projects', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PROJECTS.CREATE'))) return;
  const b=req.body;
  const source=b.inquiry_id ? await prisma.inquiry.findUnique({where:{id:b.inquiry_id}})
    : (b.source_inquiry && b.source_inquiry!=='Direct' ? await prisma.inquiry.findUnique({where:{inquiryNo:b.source_inquiry}}) : null);
  if((b.inquiry_id || (b.source_inquiry && b.source_inquiry!=='Direct')) && !source)
    return res.status(400).json({error:'Selected source inquiry was not found.'});
  if(source && (b.customer_id!==source.customerId || b.project_name!==source.projectName))
    return res.status(400).json({error:'Customer and project name must match the selected inquiry.'});
  if(!b.start_date) return res.status(400).json({error:'Select the Project Start Date.'});
  const actor=await actorName(prisma,req);
  let auditUiData={};
  const p=await prisma.$transaction(async(tx)=>{
    const projectNo=await nextProjectNo(tx);
    const [activeProjectVersion,activePlanningVersion]=await Promise.all([
      b.project_master_version_id ? null : tx.formVersion.findFirst({where:{isActive:true,formMaster:{formType:'PROJECT'}},orderBy:{versionNo:'desc'}}),
      b.planning_grid_version_id ? null : tx.planningGridVersion.findFirst({where:{isActive:true},orderBy:{versionNo:'desc'}}),
    ]);
    const uiData={
      ...b,
      inquiry_id:source?.id||null,
      project_no:projectNo,
      created_by:b.created_by||actor,
      project_master_version_id:b.project_master_version_id||activeProjectVersion?.id||null,
      planning_grid_version_id:b.planning_grid_version_id||activePlanningVersion?.id||null,
    };
    auditUiData=uiData;
    const project=await tx.project.create({data:{projectNo,inquiryId:source?.id||null,customerId:b.customer_id,projectName:b.project_name,status:b.status||'Planning',progress:Number(b.progress||0),startDate:parseDateOnly(b.start_date),targetEndDate:parseDateOnly(b.expected_end_date||b.target_end_date),createdById:req.user?.id||null,uiData}});
    await syncProjectTimesheetTasks(tx,project,uiData,req.user?.id||null);
    await createProjectNotification(tx,req,{
      eventType:'PROJECT_CREATED',
      project,
      title:`Project Created - ${project.projectNo}`,
      message:`${project.projectName} was created.`,
      payload:{project_no:project.projectNo,project_name:project.projectName},
    });
    await createProjectTaskAssignmentNotifications(tx,req,project,assignmentChangedRows([],Array.isArray(uiData?.planning_grid)?uiData.planning_grid:[]));
    return project;
  });
  await writeAudit(req,{module:'PROJECTS',action:'CREATE',recordId:p.id,newValues:auditUiData});
  res.status(201).json({id:p.id,project_no:p.projectNo});
}));
app.patch('/api/projects/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PROJECTS.UPDATE'))) return;
  const b=req.body;
  const existing=await prisma.project.findUnique({where:{id:req.params.id},include:{inquiry:true}});
  if(!existing)return res.status(404).json({error:'Project not found'});
  if(!(await requireProjectRecordAccess(req,res,existing,true))) return;
  if(existing.inquiry && ['Order Lost','Inquiry Hold'].includes(existing.inquiry.status)) return res.status(423).json({error:`Project is locked because source inquiry ${existing.inquiry.inquiryNo} is ${existing.inquiry.status}. Restore the inquiry to Order Won first.`});
  const oldPlanning=Array.isArray(existing.uiData?.planning_grid)?existing.uiData.planning_grid:[];
  const newPlanning=Array.isArray(b.planning_grid)?b.planning_grid:oldPlanning;
  const oldById=new Map(oldPlanning.map((row)=>[String(row.id||''),row]));
  const changedAssignmentRows=assignmentChangedRows(oldPlanning,newPlanning);
  const planningChanged=JSON.stringify(newPlanning)!==JSON.stringify(oldPlanning);
  const duplicateGridAdded=newPlanning.some((row)=>row.manual_grid && !oldById.has(String(row.id||'')));
  const progressChanged=b.progress!==undefined && Number(b.progress||0)!==Number(existing.progress||0);
  const statusChanged=b.status!==undefined && String(b.status)!==String(existing.status);
  const actor=await loadActorAccessContext(req.user?.id);
  if(planningChanged && !(await hasEffectivePermission(req.user?.id,'PROJECTS.PLANNING_GRID'))) return res.status(403).json({error:'You do not have permission to edit the Project Planning Grid.'});
  if(duplicateGridAdded && !(await hasEffectivePermission(req.user?.id,'PROJECTS.DUPLICATE_PLANNING_GRID'))) return res.status(403).json({error:'You do not have permission to add a duplicate Planning Grid.'});
  if(progressChanged && !(await hasEffectivePermission(req.user?.id,'PROJECTS.UPDATE_COMPLETION'))) return res.status(403).json({error:'You do not have permission to update project completion percentage.'});
  if(statusChanged && String(b.status).toLowerCase()==='completed' && !(await hasEffectivePermission(req.user?.id,'PROJECTS.MARK_COMPLETED'))) return res.status(403).json({error:'You do not have permission to mark the project completed.'});
  if(planningChanged && actor.roleCode!=='ADMIN'){
    const newById=new Map(newPlanning.map((row)=>[String(row.id||''),row]));
    const changedIds=new Set([...oldById.keys(),...newById.keys()]);
    for(const rowId of changedIds){
      const oldRow=oldById.get(rowId);
      const newRow=newById.get(rowId);
      if(JSON.stringify(oldRow||null)===JSON.stringify(newRow||null)) continue;
      const departments=[oldRow?.department,newRow?.department].map(accessName).filter(Boolean);
      if(departments.some((department)=>!actor.departmentNames.has(department)))
        return res.status(403).json({error:'HOD/TL can edit planning rows only for their own department.'});
    }
  }
  if(planningChanged){
    const assignmentUpdates=newPlanning.filter((row)=>{
      const oldRow=oldById.get(String(row.id||''));
      return String(row.assigned_to||'').trim() && accessName(oldRow?.assigned_to)!==accessName(row.assigned_to);
    });
    const assignmentNames=[...new Set(assignmentUpdates.map((row)=>String(row.assigned_to).trim()))];
    const assignedUsers=assignmentNames.length ? await prisma.user.findMany({
      where:{fullName:{in:assignmentNames},isActive:true},
      include:{userDepartments:{include:{department:true}}},
    }) : [];
    const assignedByName=new Map(assignedUsers.map((user)=>[accessName(user.fullName),user]));
    for(const row of assignmentUpdates){
      const assignedUser=assignedByName.get(accessName(row.assigned_to));
      if(!assignedUser) return res.status(400).json({error:'A selected planning-grid employee was not found or is inactive.'});
      const rowDepartment=accessName(row.department);
      const belongsToDepartment=(assignedUser.userDepartments||[]).some((membership)=>accessName(membership.department?.departmentName)===rowDepartment);
      if(rowDepartment && !belongsToDepartment)
        return res.status(400).json({error:'Each assigned employee must belong to the planning task department.'});
    }
  }
  const currentUi=(existing.uiData && typeof existing.uiData==='object' && !Array.isArray(existing.uiData)) ? existing.uiData : {};
  const uiData={
    ...currentUi,
    ...b,
    created_by:b.created_by||currentUi.created_by||'',
    project_master_version_id:b.project_master_version_id||currentUi.project_master_version_id||null,
    planning_grid_version_id:b.planning_grid_version_id||currentUi.planning_grid_version_id||null,
  };
  const p=await prisma.$transaction(async(tx)=>{
    const project=await tx.project.update({where:{id:req.params.id},data:{projectNo:b.project_no,customerId:b.customer_id,projectName:b.project_name,status:b.status,progress:b.progress===undefined?undefined:Number(b.progress),startDate:parseDateOnly(b.start_date),targetEndDate:parseDateOnly(b.expected_end_date||b.target_end_date),updatedById:req.user?.id||null,uiData}});
    await syncProjectTimesheetTasks(tx,project,uiData,req.user?.id||null);
    await createProjectNotification(tx,req,{
      eventType:'PROJECT_UPDATED',
      project,
      title:`Project Updated - ${project.projectNo}`,
      message:`${project.projectName} was updated.`,
      payload:{project_no:project.projectNo,project_name:project.projectName},
    });
    await createProjectTaskAssignmentNotifications(tx,req,project,changedAssignmentRows);
    return project;
  });
  await writeAudit(req,{module:'PROJECTS',action:'UPDATE',recordId:p.id,oldValues:existing.uiData||null,newValues:uiData});
  res.json({id:p.id});
}));

app.patch('/api/projects/:id/planning-tasks/:taskId', asyncRoute(async (req,res) => {
  const body=req.body && typeof req.body==='object' ? req.body : {};
  const suppliedKeys=Object.keys(body);
  const allowedKeys=new Set(['assigned_to','status']);
  if(!suppliedKeys.length || suppliedKeys.some((key)=>!allowedKeys.has(key)))
    return res.status(400).json({error:'Only task assignment and task status can be updated here.'});

  const project=await prisma.project.findUnique({where:{id:req.params.id},include:projectInclude});
  if(!project) return res.status(404).json({error:'Project not found'});
  if(!(await requireProjectRecordAccess(req,res,project))) return;

  const uiData=project.uiData && typeof project.uiData==='object' && !Array.isArray(project.uiData) ? project.uiData : {};
  const planningRows=Array.isArray(uiData.planning_grid) ? uiData.planning_grid : [];
  const rowIndex=planningRows.findIndex((row)=>String(row.id||'')===String(req.params.taskId||''));
  if(rowIndex<0) return res.status(404).json({error:'Project planning task not found.'});

  const actor=await loadActorAccessContext(req.user?.id);
  const currentRow=planningRows[rowIndex];
  const sameDepartment=actor.departmentNames.has(accessName(currentRow.department));
  const isDepartmentLead=['HOD','TL'].includes(actor.roleCode) && sameDepartment;
  const isAssignedEmployee=!!actor.fullName && accessName(currentRow.assigned_to)===actor.fullName;
  const isAdmin=actor.roleCode==='ADMIN';
  const changesAssignment=Object.prototype.hasOwnProperty.call(body,'assigned_to');
  const changesStatus=Object.prototype.hasOwnProperty.call(body,'status');

  if(changesAssignment){
    if(!(await hasEffectivePermission(req.user?.id,'PROJECTS.PLANNING_GRID')) || !(isAdmin || isDepartmentLead))
      return res.status(403).json({error:'Only Admin or the HOD/TL of this task department can assign this task.'});
  }
  if(changesStatus){
    if(!(await hasEffectivePermission(req.user?.id,'PROJECTS.UPDATE_COMPLETION')) || !(isAdmin || isDepartmentLead || isAssignedEmployee))
      return res.status(403).json({error:'Only the assigned employee or the HOD/TL of this task department can change its status.'});
  }

  const nextRow={...currentRow};
  if(changesAssignment){
    const requestedName=String(body.assigned_to||'').trim();
    if(!requestedName){
      nextRow.assigned_to='';
    }else{
      const assignedUser=await prisma.user.findFirst({
        where:{fullName:requestedName,isActive:true},
        include:{userDepartments:{include:{department:true}}},
      });
      if(!assignedUser) return res.status(400).json({error:'Selected employee was not found or is inactive.'});
      const rowDepartment=accessName(currentRow.department);
      const belongsToDepartment=(assignedUser.userDepartments||[]).some((membership)=>accessName(membership.department?.departmentName)===rowDepartment);
      if(rowDepartment && !belongsToDepartment)
        return res.status(400).json({error:'The selected employee must belong to the planning task department.'});
      nextRow.assigned_to=assignedUser.fullName;
    }
  }

  if(changesStatus){
    const requestedStatus=String(body.status||'').trim();
    if(!requestedStatus) return res.status(400).json({error:'Select a task status.'});
    const planningVersionId=uiData.planning_grid_version_id || null;
    const planningVersion=planningVersionId
      ? await prisma.planningGridVersion.findUnique({where:{id:planningVersionId}})
      : await prisma.planningGridVersion.findFirst({where:{isActive:true},orderBy:{versionNo:'desc'}});
    const configuredStatuses=Array.isArray(planningVersion?.statuses) && planningVersion.statuses.length
      ? planningVersion.statuses
      : ['Pending','In Progress','Delay','Completed','On Hold'];
    const matchedStatus=configuredStatuses.find((status)=>accessName(status)===accessName(requestedStatus));
    if(!matchedStatus) return res.status(400).json({error:'Selected task status is not available for this project.'});
    const wasCompleted=accessName(currentRow.status)==='COMPLETED';
    const isCompleted=accessName(matchedStatus)==='COMPLETED';
    nextRow.status=matchedStatus;
    nextRow.progress=isCompleted ? 100 : (wasCompleted ? 0 : Number(currentRow.progress||0));
  }

  const nextRows=planningRows.map((row,index)=>index===rowIndex ? nextRow : row);
  const completedCount=nextRows.filter((row)=>accessName(row.status)==='COMPLETED').length;
  const progress=nextRows.length ? Math.round((completedCount/nextRows.length)*100) : 0;
  const nextUiData={...uiData,planning_grid:nextRows,progress};
  const updated=await prisma.$transaction(async(tx)=>{
    const saved=await tx.project.update({
      where:{id:project.id},
      data:{progress,uiData:nextUiData,updatedById:req.user?.id||null},
    });
    await syncProjectTimesheetTasks(tx,saved,nextUiData,req.user?.id||null);
    if(changesAssignment && accessName(currentRow.assigned_to)!==accessName(nextRow.assigned_to))
      await createProjectTaskAssignmentNotifications(tx,req,saved,[nextRow]);
    return saved;
  });
  await writeAudit(req,{
    module:'PROJECTS',
    action:changesAssignment && changesStatus ? 'TASK_ASSIGNMENT_STATUS_UPDATE' : changesAssignment ? 'TASK_ASSIGNMENT_UPDATE' : 'TASK_STATUS_UPDATE',
    recordId:updated.id,
    oldValues:{task_id:currentRow.id,assigned_to:currentRow.assigned_to||'',status:currentRow.status||''},
    newValues:{task_id:nextRow.id,assigned_to:nextRow.assigned_to||'',status:nextRow.status||''},
  });
  res.json({id:updated.id,task:nextRow,progress});
}));

const nextCopiedProjectNo = async (sourceNo) => {
  const value=String(sourceNo||'PRJ').trim();
  const match=value.match(/^(.*?)(\d+)$/);
  if(!match){
    const prefix=`${value}-COPY-`;
    const rows=await prisma.project.findMany({where:{projectNo:{startsWith:prefix}},select:{projectNo:true}});
    const max=rows.reduce((n,row)=>Math.max(n,Number(String(row.projectNo).slice(prefix.length))||0),0);
    return `${prefix}${String(max+1).padStart(2,'0')}`;
  }
  const prefix=match[1];
  const width=match[2].length;
  const rows=await prisma.project.findMany({where:{projectNo:{startsWith:prefix}},select:{projectNo:true}});
  const max=rows.reduce((n,row)=>{const m=String(row.projectNo).match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(\\d+)$`));return m?Math.max(n,Number(m[1])||0):n;},Number(match[2])||0);
  return `${prefix}${String(max+1).padStart(width,'0')}`;
};

app.post('/api/projects/:id/copy', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PROJECTS.CREATE'))) return;
  const source=await prisma.project.findUnique({where:{id:req.params.id},include:{...projectInclude,documents:true}});
  if(!source)return res.status(404).json({error:'Project not found'});
  if(!(await requireProjectRecordAccess(req,res,source))) return;
  const projectNo=await nextCopiedProjectNo(source.projectNo);
  const actor=await actorName(prisma,req);
  const sourceUi=source.uiData && typeof source.uiData==='object' ? source.uiData : {};
  const resetPlanning=(sourceUi.planning_grid||[]).map((row)=>({...row,assigned_to:'',planned_start:'',planned_end:'',actual_start:'',actual_end:'',status:'Pending',progress:0,remark:''}));
  const copiedUi={...sourceUi,project_no:projectNo,source_inquiry:'Direct',inquiry_id:null,project_name:`${source.projectName} - Copy`,status:'Planning',progress:0,created_at:new Date().toISOString().slice(0,10),created_by:actor,assignments:[],planning_grid:resetPlanning};
  const created=await prisma.$transaction(async(tx)=>{
    const project=await tx.project.create({data:{projectNo,inquiryId:null,customerId:source.customerId,projectName:`${source.projectName} - Copy`,status:'Planning',progress:0,createdById:req.user?.id||null,uiData:copiedUi}});
    if(source.documents?.length){
      await tx.projectDocument.createMany({data:source.documents.filter((link)=>link.isActive!==false).map((link)=>({projectId:project.id,documentId:link.documentId,description:link.description||null,isActive:true})),skipDuplicates:true});
    }
    await createProjectNotification(tx,req,{
      eventType:'PROJECT_CREATED',
      project,
      title:`Project Created - ${projectNo}`,
      message:`${project.projectName} was created as a copy of ${source.projectNo}.`,
      payload:{project_no:projectNo,project_name:project.projectName,source_project_no:source.projectNo},
    });
    return project;
  });
  await writeAudit(req,{module:'PROJECTS',action:'COPY',recordId:created.id,newValues:{source_project_id:source.id,project_no:projectNo}});
  res.status(201).json({id:created.id,project_no:projectNo});
}));

app.get('/api/timesheet/team-members', asyncRoute(async (req,res) => {
  const master=req.query.master==='true';
  const user=await userScope(req.user?.id);
  if(!user) return res.status(401).json({error:'Not authenticated.'});

  const role=String(user.role?.roleCode||'').toUpperCase();
  const permission=master?'TIMESHEET_MASTER.VIEW':'TIMESHEET.TEAM_VIEW';
  if(role!=='ADMIN' && !(await hasEffectivePermission(user.id,permission))) {
    return res.status(403).json({error:'You do not have permission to view team timesheet members.'});
  }

  const departmentIds=user.userDepartments.map((item)=>item.departmentId);
  const where={isActive:true};

  // Admin/master is company-wide. All other team views are restricted
  // to people sharing at least one department with the logged-in user.
  if(role!=='ADMIN'){
    if(!departmentIds.length) return res.json([]);
    where.userDepartments={some:{departmentId:{in:departmentIds}}};
  }

  const members=await prisma.user.findMany({
    where,
    include:{
      role:true,
      userDepartments:{include:{department:true}},
    },
    orderBy:{fullName:'asc'},
  });

  res.json(members.map((member)=>({
    id:member.id,
    employee_no:member.employeeNo,
    full_name:member.fullName,
    email:member.email,
    role_code:member.role?.roleCode||'',
    departments:member.userDepartments.map((ud)=>({
      id:ud.departmentId,
      name:ud.department?.departmentName||'',
      is_primary:Boolean(ud.isPrimary),
    })),
  })));
}));

app.get('/api/timesheet/tasks', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,req.query.master==='true'?'TIMESHEET_MASTER.VIEW':'TIMESHEET.VIEW'))) return;
  const requestedScope=String(req.query.scope||'self').toLowerCase();
  const master=req.query.master==='true';
  const scope=await timesheetScopeWhere(req,requestedScope,master);

  const filters={isArchived:req.query.archived==='true'?true:false};
  if(req.query.status) filters.status=String(req.query.status);
  if(req.query.task_type) filters.taskType=String(req.query.task_type);
  if(req.query.project_id) filters.projectId=String(req.query.project_id);
  if(req.query.department_id) filters.departmentId=String(req.query.department_id);
  if(req.query.assigned_user_id) filters.assignedUserId=String(req.query.assigned_user_id);
  if(req.query.from || req.query.to){
    filters.startDate={};
    if(req.query.from) filters.startDate.gte=parseDateOnly(req.query.from);
    if(req.query.to) filters.startDate.lte=parseDateOnly(req.query.to);
  }

  // Keep scope and user-selected filters separate so assigned_user_id can
  // never override SELF or department scope security.
  const where={AND:[scope,filters]};
  const rows=await prisma.timesheetTask.findMany({
    where,
    include:timesheetInclude,
    orderBy:[
      {assignedUser:{fullName:'asc'}},
      {startDate:'asc'},
      {dueDate:'asc'},
      {createdAt:'desc'},
    ],
  });
  res.json(rows.map(serializeTimesheetTask));
}));

app.get('/api/timesheet/summary', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,req.query.master==='true'?'TIMESHEET_MASTER.VIEW':'TIMESHEET.VIEW'))) return;
  const scope=await timesheetScopeWhere(req,String(req.query.scope||'self').toLowerCase(),req.query.master==='true');
  const rows=await prisma.timesheetTask.findMany({where:{...scope,isArchived:false},select:{status:true,actualHours:true,dueDate:true}});
  const now=new Date(); now.setHours(0,0,0,0);
  res.json({
    total:rows.length,
    pending:rows.filter((row)=>['Pending','Backlog','Planned'].includes(row.status)).length,
    in_progress:rows.filter((row)=>row.status==='In Progress').length,
    completed:rows.filter((row)=>row.status==='Completed').length,
    overdue:rows.filter((row)=>row.status!=='Completed' && row.dueDate && new Date(row.dueDate)<now).length,
    actual_hours:rows.reduce((sum,row)=>sum+Number(row.actualHours||0),0),
  });
}));

app.post('/api/timesheet/tasks', asyncRoute(async (req,res) => {
  const master=req.body.master===true;
  if(!(await requireEffectivePermission(req,res,master?'TIMESHEET_MASTER.CREATE':'TIMESHEET.CREATE'))) return;
  const body=req.body||{};
  const assignedUserId=body.assigned_user_id || req.user?.id;
  if(!assignedUserId) return res.status(400).json({error:'Assigned user is required.'});
  if(assignedUserId!==req.user?.id && !(await hasEffectivePermission(req.user?.id,master?'TIMESHEET_MASTER.ASSIGN':'TIMESHEET.ASSIGN'))) return res.status(403).json({error:'You do not have permission to assign this task to another user.'});
  const assigned=await prisma.user.findUnique({where:{id:assignedUserId},include:{userDepartments:true}});
  if(!assigned || !assigned.isActive) return res.status(400).json({error:'Assigned user is invalid or inactive.'});
  const row=await prisma.timesheetTask.create({data:{
    title:String(body.title||'').trim(),
    description:String(body.description||'').trim()||null,
    taskSource:'USER',
    projectId:body.project_id||null,
    departmentId:body.department_id||assigned.userDepartments[0]?.departmentId||null,
    assignedUserId,
    createdById:req.user?.id||null,
    startDate:parseDateOnly(body.start_date||new Date().toISOString().slice(0,10)),
    dueDate:parseDateOnly(body.due_date),
    status:String(body.status||'Backlog'),
    priority:String(body.priority||'Medium'),
    taskType:String(body.task_type||'Other'),
    estimatedHours:Number(body.estimated_hours||0),
    actualHours:Number(body.actual_hours||0),
    startTime:body.start_time||null,
    endTime:body.end_time||null,
    remarks:String(body.remarks||'').trim()||null,
  },include:timesheetInclude});
  if(row.projectId && row.project){
    await createProjectNotification(prisma,req,{
      eventType:'PROJECT_TASK_ASSIGNED',
      project:row.project,
      title:`Project Task Assigned - ${row.title}`.slice(0,180),
      message:[row.project.projectNo,row.project.projectName,row.department?.departmentName].filter(Boolean).join(' · '),
      payload:{project_no:row.project.projectNo,project_name:row.project.projectName,task:row.title,assigned_to:row.assignedUser?.fullName||'',department:row.department?.departmentName||''},
      userIds:[row.assignedUserId],
    });
  }
  await writeAudit(req,{module:'TIMESHEET',action:'CREATE',recordId:row.id,newValues:body});
  res.status(201).json(serializeTimesheetTask(row));
}));

app.patch('/api/timesheet/tasks/:id', asyncRoute(async (req,res) => {
  const existing=await prisma.timesheetTask.findUnique({where:{id:req.params.id},include:timesheetInclude});
  if(!existing) return res.status(404).json({error:'Timesheet task not found.'});
  const canMaster=await hasEffectivePermission(req.user?.id,'TIMESHEET_MASTER.UPDATE');
  const canOwn=existing.assignedUserId===req.user?.id && await hasEffectivePermission(req.user?.id,'TIMESHEET.UPDATE');
  const canTeam=await hasEffectivePermission(req.user?.id,'TIMESHEET.ASSIGN');
  const body=req.body||{};
  // Archive/Unarchive-only requests (just is_archived) are available to
  // everyone for their own and their team's tasks -- a lighter right than
  // the full edit permissions checked below.
  const archiveOnlyKeys=new Set(['is_archived']);
  const isArchiveOnlyRequest=Object.keys(body).length>0 && Object.keys(body).every((key)=>archiveOnlyKeys.has(key));
  if(isArchiveOnlyRequest){
    if(!(await canArchiveTimesheetTask(req,existing))) return res.status(403).json({error:'You do not have permission to archive/unarchive this task.'});
  } else if(!canMaster && !canOwn && !canTeam) {
    return res.status(403).json({error:'You do not have permission to update this task.'});
  }
  if(existing.taskSource==='PROJECT' && !canMaster && !canTeam){
    const allowed=new Set(['status','actual_hours','start_time','end_time','remarks','actual_end_date']);
    const blocked=Object.keys(body).filter((key)=>!allowed.has(key));
    if(blocked.length) return res.status(403).json({error:`Project-linked tasks allow employees to update only status, time, actual end date and remarks. Blocked: ${blocked.join(', ')}`});
  }
  if(body.assigned_user_id && body.assigned_user_id!==existing.assignedUserId && !(canMaster||canTeam)) return res.status(403).json({error:'You do not have permission to reassign this task.'});
  const updated=await prisma.$transaction(async(tx)=>{
    const task=await tx.timesheetTask.update({where:{id:existing.id},data:{
      title:body.title===undefined?undefined:String(body.title).trim(),
      description:body.description===undefined?undefined:(String(body.description).trim()||null),
      assignedUserId:body.assigned_user_id===undefined?undefined:body.assigned_user_id,
      departmentId:body.department_id===undefined?undefined:(body.department_id||null),
      startDate:body.start_date===undefined?undefined:parseDateOnly(body.start_date),
      dueDate:body.due_date===undefined?undefined:parseDateOnly(body.due_date),
      actualEndDate:body.actual_end_date===undefined?undefined:parseDateOnly(body.actual_end_date),
      status:body.status===undefined?undefined:String(body.status),
      priority:body.priority===undefined?undefined:String(body.priority),
      taskType:body.task_type===undefined?undefined:String(body.task_type||'Other'),
      estimatedHours:body.estimated_hours===undefined?undefined:Number(body.estimated_hours||0),
      actualHours:body.actual_hours===undefined?undefined:Number(body.actual_hours||0),
      startTime:body.start_time===undefined?undefined:(body.start_time||null),
      endTime:body.end_time===undefined?undefined:(body.end_time||null),
      remarks:body.remarks===undefined?undefined:(String(body.remarks).trim()||null),
      isArchived:body.is_archived===undefined?undefined:!!body.is_archived,
    },include:timesheetInclude});
    await reverseSyncTimesheetStatus(tx,task);
    return task;
  });
  if(updated.projectId && updated.project && updated.assignedUserId!==existing.assignedUserId){
    await createProjectNotification(prisma,req,{
      eventType:'PROJECT_TASK_ASSIGNED',
      project:updated.project,
      title:`Project Task Assigned - ${updated.title}`.slice(0,180),
      message:[updated.project.projectNo,updated.project.projectName,updated.department?.departmentName].filter(Boolean).join(' · '),
      payload:{project_no:updated.project.projectNo,project_name:updated.project.projectName,task:updated.title,assigned_to:updated.assignedUser?.fullName||'',department:updated.department?.departmentName||''},
      userIds:[updated.assignedUserId],
    });
  }
  await writeAudit(req,{module:'TIMESHEET',action:'UPDATE',recordId:updated.id,oldValues:serializeTimesheetTask(existing),newValues:body});
  res.json(serializeTimesheetTask(updated));
}));

app.delete('/api/timesheet/tasks/:id', asyncRoute(async (req,res) => {
  const existing=await prisma.timesheetTask.findUnique({where:{id:req.params.id}});
  if(!existing) return res.status(404).json({error:'Timesheet task not found.'});
  if(!(await canArchiveTimesheetTask(req,existing))) return res.status(403).json({error:'You do not have permission to archive this task.'});
  await prisma.timesheetTask.update({where:{id:existing.id},data:{isArchived:true}});
  await writeAudit(req,{module:'TIMESHEET',action:'ARCHIVE',recordId:existing.id,oldValues:{is_archived:existing.isArchived},newValues:{is_archived:true}});
  res.status(204).end();
}));

const uniqueOptions = (options = []) => {
  const seen = new Set();
  const result = [];
  for (const raw of options || []) {
    const label = String(raw ?? '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
};

const fieldConfigJson = (field, subsection = null, existingConfig = null) => {
  const config = existingConfig && typeof existingConfig === 'object' && !Array.isArray(existingConfig)
    ? { ...existingConfig }
    : {};
  delete config.placeholder;
  delete config.table_config;
  delete config.subsection;
  delete config.document_type_id;

  if (field.placeholder) config.placeholder = field.placeholder;
  if (field.table_config) config.table_config = field.table_config;
  if (field.document_type_id) config.document_type_id = String(field.document_type_id);
  if (subsection) {
    config.subsection = {
      id: String(subsection.id || `sub-${subsection.order || 0}-${subsection.title || 'section'}`),
      title: subsection.title || 'Sub Section',
      description: subsection.description || '',
      order: Number(subsection.order || 0),
      is_active: subsection.is_active !== false,
    };
  }
  return config;
};

const flattenSectionFields = (section = {}) => {
  const fields = [];
  for (const field of section.fields || []) fields.push({ field, subsection:null });
  for (const subsection of section.subsections || []) {
    for (const field of subsection.fields || []) fields.push({ field, subsection });
  }
  return fields;
};

const newFieldKey = () => `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

async function replaceFieldOptions(tx, formFieldId, options = []) {
  await tx.formFieldOption.deleteMany({ where:{ formFieldId } });
  const normalized = uniqueOptions(options);
  if (!normalized.length) return;
  await tx.formFieldOption.createMany({
    data: normalized.map((option, index) => ({
      formFieldId,
      optionLabel:option,
      optionValue:option,
      displayOrder:index + 1,
      isActive:true,
    })),
  });
}

/**
 * Persist the full Form Builder structure without deleting referenced rows.
 * Existing DB ids are preserved, newly-added UI ids are inserted, and items
 * removed from the builder are deactivated instead of physically deleted.
 * This is shared by Inquiry Master, Project Master and every Panel Master.
 */
async function syncVersionStructure(tx, versionId, incomingSections = []) {
  const current = await tx.formVersion.findUnique({ where:{ id:versionId }, include:versionInclude });
  if (!current) throw new Error('Form version not found');

  const existingSectionsById = new Map((current.sections || []).map((section) => [section.id, section]));
  const touchedSectionIds = new Set();

  for (let sectionIndex = 0; sectionIndex < incomingSections.length; sectionIndex += 1) {
    const incoming = incomingSections[sectionIndex] || {};
    const sectionName = String(incoming.title || incoming.section_name || `Section ${sectionIndex + 1}`).trim();
    const sectionActive = incoming.is_active !== false;
    let section = existingSectionsById.get(incoming.id);

    if (section) {
      section = await tx.formSection.update({
        where:{ id:section.id },
        data:{
          sectionName,
          description:incoming.description || null,
          displayOrder:Number(incoming.order || sectionIndex + 1),
          isActive:sectionActive,
        },
        include:{ fields:{ include:{ options:true } } },
      });
    } else {
      section = await tx.formSection.create({
        data:{
          formVersionId:versionId,
          sectionName,
          description:incoming.description || null,
          displayOrder:Number(incoming.order || sectionIndex + 1),
          isActive:sectionActive,
        },
        include:{ fields:{ include:{ options:true } } },
      });
    }
    touchedSectionIds.add(section.id);

    const existingFields = section.fields || [];
    const existingById = new Map(existingFields.map((field) => [field.id, field]));
    const existingByKey = new Map(existingFields.map((field) => [field.fieldKey, field]));
    const touchedFieldIds = new Set();
    const flattened = flattenSectionFields(incoming);

    for (let fieldIndex = 0; fieldIndex < flattened.length; fieldIndex += 1) {
      const { field:incomingField, subsection } = flattened[fieldIndex];
      const label = String(incomingField?.label || '').trim();
      if (!label) continue;

      const subsectionActive = subsection ? subsection.is_active !== false : true;
      const fieldActive = sectionActive && subsectionActive && incomingField.is_active !== false;
      const required = fieldActive && !!incomingField.required;
      let existingField = existingById.get(incomingField.id);
      if (!existingField && incomingField.field_key) existingField = existingByKey.get(incomingField.field_key);

      if (existingField) {
        const updated = await tx.formField.update({
          where:{ id:existingField.id },
          data:{
            fieldLabel:label,
            fieldType:incomingField.field_type || existingField.fieldType || 'text',
            isRequired:required,
            displayOrder:Number(incomingField.order || fieldIndex + 1),
            isActive:fieldActive,
            configJson:fieldConfigJson(incomingField, subsection, existingField.configJson),
          },
        });
        touchedFieldIds.add(updated.id);
        await replaceFieldOptions(tx, updated.id, incomingField.options || []);
      } else {
        const created = await tx.formField.create({
          data:{
            formSectionId:section.id,
            fieldKey:incomingField.field_key || newFieldKey(),
            fieldLabel:label,
            fieldType:incomingField.field_type || 'text',
            isRequired:required,
            displayOrder:Number(incomingField.order || fieldIndex + 1),
            isActive:fieldActive,
            configJson:fieldConfigJson(incomingField, subsection),
          },
        });
        touchedFieldIds.add(created.id);
        await replaceFieldOptions(tx, created.id, incomingField.options || []);
      }
    }

    const omittedFieldIds = existingFields
      .map((field) => field.id)
      .filter((id) => !touchedFieldIds.has(id));
    if (omittedFieldIds.length) {
      await tx.formField.updateMany({
        where:{ id:{ in:omittedFieldIds } },
        data:{ isActive:false, isRequired:false },
      });
    }
  }

  const omittedSectionIds = (current.sections || [])
    .map((section) => section.id)
    .filter((id) => !touchedSectionIds.has(id));
  if (omittedSectionIds.length) {
    await tx.formSection.updateMany({ where:{ id:{ in:omittedSectionIds } }, data:{ isActive:false } });
    await tx.formField.updateMany({
      where:{ formSectionId:{ in:omittedSectionIds } },
      data:{ isActive:false, isRequired:false },
    });
  }
}

async function createVersionForFormMaster(formMasterId, defaultName, sections, formName, createdById = null, activate = true) {
  return prisma.$transaction(async (tx) => {
    const max = await tx.formVersion.aggregate({ where:{ formMasterId }, _max:{ versionNo:true } });
    const versionNo = (max._max.versionNo || 0) + 1;
    const shouldActivate = activate || versionNo === 1;
    if (shouldActivate) await tx.formVersion.updateMany({ where:{ formMasterId, isActive:true }, data:{ isActive:false } });
    const version = await tx.formVersion.create({
      data:{
        formMasterId,
        versionNo,
        versionName:formName || `${defaultName} v${versionNo}`,
        isActive:shouldActivate,
        createdById,
      },
    });
    await syncVersionStructure(tx, version.id, sections || []);
    return tx.formVersion.findUnique({ where:{ id:version.id }, include:versionInclude });
  });
}

async function createMasterVersion(type, sections, formName, createdById = null, activate = true) {
  let master = await prisma.formMaster.findFirst({ where:{ formType:type } });
  if (!master && type==='TICKET') {
    master=await prisma.formMaster.upsert({
      where:{formCode:'TICKET_FORM'},
      update:{formName:'Ticket Form',formType:'TICKET',isActive:true},
      create:{formCode:'TICKET_FORM',formName:'Ticket Form',formType:'TICKET',isActive:true},
    });
  }
  if (!master) throw new Error(`${type} form master not found`);
  return createVersionForFormMaster(master.id, master.formName, sections, formName, createdById, activate);
}

app.post('/api/masters/inquiry/versions', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'INQUIRY_MASTER.CREATE'))) return;
  const version=serializeVersion(await createMasterVersion('INQUIRY', req.body.sections, req.body.form_name, req.user?.id || null, toBool(req.body.is_active,true)));
  await writeAudit(req,{module:'INQUIRY_MASTER',action:'VERSION_CREATE',recordId:version.id,newValues:version});
  res.status(201).json(version);
}));
app.post('/api/masters/project/versions', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PROJECT_MASTER.CREATE'))) return;
  const version=serializeVersion(await createMasterVersion('PROJECT', req.body.sections, req.body.form_name, req.user?.id || null, toBool(req.body.is_active,true)));
  await writeAudit(req,{module:'PROJECT_MASTER',action:'VERSION_CREATE',recordId:version.id,newValues:version});
  res.status(201).json(version);
}));
app.post('/api/masters/ticket/versions', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'TICKET_MASTER.CREATE'))) return;
  const version=serializeVersion(await createMasterVersion('TICKET', req.body.sections, req.body.form_name, req.user?.id || null, toBool(req.body.is_active,true)));
  await writeAudit(req,{module:'TICKET_MASTER',action:'VERSION_CREATE',recordId:version.id,newValues:version});
  res.status(201).json(version);
}));

app.patch('/api/form-versions/:id', asyncRoute(async (req,res) => {
  const b = req.body || {};
  const existing = await prisma.formVersion.findUnique({ where:{ id:req.params.id }, include:{ formMaster:true } });
  if (!existing) return res.status(404).json({ error:'Form version not found' });
  const masterPermission = existing.formMaster?.formType==='INQUIRY' ? 'INQUIRY_MASTER.UPDATE'
    : existing.formMaster?.formType==='PROJECT' ? 'PROJECT_MASTER.UPDATE'
      : existing.formMaster?.formType==='TICKET' ? 'TICKET_MASTER.UPDATE' : 'PANEL_MASTER.UPDATE';
  if(!(await requireEffectivePermission(req,res,masterPermission))) return;

  const fallbackVersion=b.is_active===false && existing.isActive
    ? await prisma.formVersion.findFirst({where:{formMasterId:existing.formMasterId,id:{not:existing.id}},orderBy:{versionNo:'asc'}})
    : null;
  if(b.is_active===false && existing.isActive && !fallbackVersion)
    return res.status(409).json({error:'This is the only form version. Create another version before deactivating it.'});
  const before = await prisma.formVersion.findUnique({where:{id:existing.id},include:versionInclude});

  await prisma.$transaction(async (tx) => {
    if (b.is_active === true) {
      await tx.formVersion.updateMany({
        where:{ formMasterId:existing.formMasterId, NOT:{ id:existing.id } },
        data:{ isActive:false },
      });
    }
    if(fallbackVersion){
      await tx.formVersion.updateMany({where:{formMasterId:existing.formMasterId,id:{not:existing.id}},data:{isActive:false}});
      await tx.formVersion.update({where:{id:fallbackVersion.id},data:{isActive:true}});
    }

    const versionPatch = {};
    if (Object.prototype.hasOwnProperty.call(b, 'form_name')) versionPatch.versionName = b.form_name || null;
    if (Object.prototype.hasOwnProperty.call(b, 'is_active')) versionPatch.isActive = !!b.is_active;
    if (Object.keys(versionPatch).length) {
      await tx.formVersion.update({ where:{ id:existing.id }, data:versionPatch });
    }

    if (Array.isArray(b.sections)) {
      await syncVersionStructure(tx, existing.id, b.sections);
    }
  });

  const updated = await prisma.formVersion.findUnique({ where:{ id:existing.id }, include:versionInclude });
  await writeAudit(req,{module:`${existing.formMaster.formType}_MASTER`,action:b.is_active===false?'VERSION_DEACTIVATE':b.is_active===true?'VERSION_ACTIVATE':'VERSION_UPDATE',recordId:updated.id,oldValues:serializeVersion(before),newValues:{...serializeVersion(updated),active_replacement_id:fallbackVersion?.id||null}});
  res.json({...serializeVersion(updated),active_replacement_id:fallbackVersion?.id||null});
}));

app.post('/api/panel-masters', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PANEL_MASTER.CREATE'))) return;
  const b=req.body || {};
  const panelCode=String(b.panel_code || '').trim().toUpperCase();
  const panelType=String(b.panel_type || '').trim();
  const formName=String(b.form_name || '').trim() || `${panelType} Form`;
  if(!panelCode || !panelType || !formName) return res.status(400).json({error:'Form name, panel code and panel type are required.'});
  const p=await prisma.$transaction(async(tx) => {
    const fm=await tx.formMaster.create({
      data:{
        formCode:`PANEL_${panelCode.replace(/[^A-Z0-9]+/g,'_')}`,
        formName,
        formType:'PANEL',
      },
    });
    const panel=await tx.panelMaster.create({
      data:{
        panelCode,
        panelType,
        formMasterId:fm.id,
        isActive:toBool(b.is_active),
      },
    });
    const version=await tx.formVersion.create({
      data:{
        formMasterId:fm.id,
        versionNo:1,
        versionName:formName,
        isActive:true,
        createdById:req.user?.id || null,
      },
    });
    await syncVersionStructure(tx, version.id, Array.isArray(b.sections) ? b.sections : []);
    return panel;
  });
  await writeAudit(req,{
    module:'PANELS',
    action:'CREATE',
    recordId:p.id,
    newValues:{...b,panel_code:panelCode,panel_type:panelType,form_name:formName},
  });
  res.status(201).json({id:p.id});
}));
app.patch('/api/panel-masters/:id', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PANEL_MASTER.UPDATE'))) return;
  const b=req.body || {};
  const existing=await prisma.panelMaster.findUnique({where:{id:req.params.id},include:{formMaster:true}});
  if(!existing) return res.status(404).json({error:'Panel master not found'});
  const panelCode=String(b.panel_code ?? existing.panelCode).trim().toUpperCase();
  const panelType=String(b.panel_type ?? existing.panelType).trim();
  const formName=String(b.form_name ?? existing.formMaster?.formName ?? '').trim() || `${panelType} Form`;
  if(!panelCode || !panelType || !formName) return res.status(400).json({error:'Form name, panel code and panel type are required.'});
  const p=await prisma.$transaction(async(tx) => {
    await tx.formMaster.update({
      where:{id:existing.formMasterId},
      data:{
        formCode:`PANEL_${panelCode.replace(/[^A-Z0-9]+/g,'_')}`,
        formName,
      },
    });
    return tx.panelMaster.update({
      where:{id:req.params.id},
      data:{
        panelCode,
        panelType,
        ...(Object.prototype.hasOwnProperty.call(b,'is_active') ? {isActive:toBool(b.is_active)} : {}),
      },
    });
  });
  await writeAudit(req,{
    module:'PANELS',
    action:'UPDATE',
    recordId:p.id,
    oldValues:{panel_code:existing.panelCode,panel_type:existing.panelType,form_name:existing.formMaster?.formName,is_active:existing.isActive},
    newValues:{...b,panel_code:panelCode,panel_type:panelType,form_name:formName},
  });
  res.json({id:p.id});
}));
app.post('/api/panel-masters/:id/versions', asyncRoute(async (req,res) => {
  if(!(await requireEffectivePermission(req,res,'PANEL_MASTER.CREATE'))) return;
  const pm = await prisma.panelMaster.findUnique({ where:{ id:req.params.id }, include:{ formMaster:true } });
  if (!pm) return res.status(404).json({ error:'Panel master not found' });
  const b = req.body || {};
  const version = await createVersionForFormMaster(
    pm.formMasterId,
    pm.formMaster?.formName || `${pm.panelType} Form`,
    b.sections || [],
    b.form_name,
    req.user?.id || null,
    toBool(b.is_active,true),
  );
  await writeAudit(req,{module:'PANEL_MASTER',action:'VERSION_CREATE',recordId:version.id,newValues:serializeVersion(version)});
  res.status(201).json(serializeVersion(version));
}));


const normalizePlanningVersionPayload = (body = {}) => ({
  formName:String(body.form_name || 'Project Planning Grid').trim() || 'Project Planning Grid',
  statuses:Array.isArray(body.statuses) ? body.statuses.map((x)=>String(x).trim()).filter(Boolean) : ['Pending','In Progress','Delay','Completed','On Hold'],
  departmentTasks:(body.department_tasks && typeof body.department_tasks==='object' && !Array.isArray(body.department_tasks)) ? body.department_tasks : {},
});

async function applyPlanningVersionToTaskMasters(tx, version) {
  const map=(version.departmentTasks && typeof version.departmentTasks==='object') ? version.departmentTasks : {};
  const departments=await tx.department.findMany({select:{id:true,departmentName:true}});
  await tx.planningTaskMaster.updateMany({data:{isActive:false}});
  for (const department of departments) {
    const rows=Array.isArray(map[department.departmentName]) ? map[department.departmentName] : [];
    for (let index=0; index<rows.length; index++) {
      const item=rows[index];
      const name=String(typeof item==='string'?item:item?.name||'').trim();
      if(!name) continue;
      await tx.planningTaskMaster.upsert({
        where:{departmentId_taskName:{departmentId:department.id,taskName:name}},
        update:{isActive:true,displayOrder:index+1},
        create:{departmentId:department.id,taskName:name,displayOrder:index+1,isActive:true},
      });
    }
  }
}

app.get('/api/planning-grid/versions', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.VIEW'))) return;
  const rows=await prisma.planningGridVersion.findMany({orderBy:{versionNo:'desc'}});
  res.json(rows.map((v)=>({id:v.id,version_no:v.versionNo,form_name:v.formName,statuses:v.statuses,department_tasks:v.departmentTasks,is_active:v.isActive,created_at:v.createdAt.toISOString()})));
}));

app.post('/api/planning-grid/versions', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.CREATE'))) return;
  const payload=normalizePlanningVersionPayload(req.body);
  const max=await prisma.planningGridVersion.aggregate({_max:{versionNo:true}});
  const versionNo=(max._max.versionNo||0)+1;
  const shouldActivate=toBool(req.body.is_active,true) || versionNo===1;
  const row=await prisma.$transaction(async(tx)=>{
    if(shouldActivate) await tx.planningGridVersion.updateMany({where:{isActive:true},data:{isActive:false}});
    const created=await tx.planningGridVersion.create({data:{versionNo,formName:payload.formName,statuses:payload.statuses,departmentTasks:payload.departmentTasks,isActive:shouldActivate,createdById:req.user?.id||null}});
    if(shouldActivate) await applyPlanningVersionToTaskMasters(tx,created);
    return created;
  });
  await writeAudit(req,{module:'PLANNING_GRID_MASTER',action:'VERSION_CREATE',recordId:row.id,newValues:{form_name:row.formName,version_no:row.versionNo,is_active:row.isActive,statuses:row.statuses,department_tasks:row.departmentTasks}});
  res.status(201).json({id:row.id,version_no:row.versionNo,is_active:row.isActive});
}));

app.patch('/api/planning-grid/versions/:id', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.UPDATE'))) return;
  const old=await prisma.planningGridVersion.findUnique({where:{id:req.params.id}});
  if(!old) return res.status(404).json({error:'Planning Grid version not found.'});
  const fallbackVersion=req.body.is_active===false && old.isActive
    ? await prisma.planningGridVersion.findFirst({where:{id:{not:old.id}},orderBy:{versionNo:'asc'}})
    : null;
  if(req.body.is_active===false && old.isActive && !fallbackVersion)
    return res.status(409).json({error:'This is the only Planning Grid version. Create another version before deactivating it.'});
  const payload=normalizePlanningVersionPayload({...old,form_name:req.body.form_name??old.formName,statuses:req.body.statuses??old.statuses,department_tasks:req.body.department_tasks??old.departmentTasks});
  const activate=req.body.is_active===true;
  const row=await prisma.$transaction(async(tx)=>{
    if(activate) await tx.planningGridVersion.updateMany({where:{isActive:true,id:{not:old.id}},data:{isActive:false}});
    if(fallbackVersion){
      await tx.planningGridVersion.updateMany({where:{id:{not:old.id}},data:{isActive:false}});
      const replacement=await tx.planningGridVersion.update({where:{id:fallbackVersion.id},data:{isActive:true}});
      await applyPlanningVersionToTaskMasters(tx,replacement);
    }
    const updated=await tx.planningGridVersion.update({where:{id:old.id},data:{formName:req.body.form_name===undefined?undefined:payload.formName,statuses:req.body.statuses===undefined?undefined:payload.statuses,departmentTasks:req.body.department_tasks===undefined?undefined:payload.departmentTasks,isActive:req.body.is_active===undefined?undefined:!!req.body.is_active}});
    if(updated.isActive) await applyPlanningVersionToTaskMasters(tx,updated);
    return updated;
  });
  const auditPlanning=(v)=>({form_name:v.formName,version_no:v.versionNo,is_active:v.isActive,statuses:v.statuses,department_tasks:v.departmentTasks});
  await writeAudit(req,{module:'PLANNING_GRID_MASTER',action:activate?'VERSION_ACTIVATE':fallbackVersion?'VERSION_DEACTIVATE':'VERSION_UPDATE',recordId:row.id,oldValues:auditPlanning(old),newValues:{...auditPlanning(row),active_replacement_id:fallbackVersion?.id||null}});
  res.json({id:row.id,version_no:row.versionNo,is_active:row.isActive,active_replacement_id:fallbackVersion?.id||null});
}));

app.post('/api/planning/tasks', asyncRoute(async (req,res)=>{if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.CREATE'))) return;const d=await prisma.department.findFirst({where:{departmentName:req.body.department}});if(!d)return res.status(404).json({error:'Department not found'});const max=await prisma.planningTaskMaster.aggregate({where:{departmentId:d.id},_max:{displayOrder:true}});const t=await prisma.planningTaskMaster.create({data:{departmentId:d.id,taskName:req.body.name,displayOrder:(max._max.displayOrder||0)+1}});res.status(201).json({id:t.id,name:t.taskName});}));
app.patch('/api/planning/tasks/:id', asyncRoute(async (req,res)=>{if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.UPDATE'))) return;const t=await prisma.planningTaskMaster.update({where:{id:req.params.id},data:{taskName:req.body.name,isActive:req.body.is_active,displayOrder:req.body.display_order}});res.json({id:t.id,name:t.taskName});}));
app.delete('/api/planning/tasks/:id', asyncRoute(async (req,res)=>{if(!(await requireEffectivePermission(req,res,'PLANNING_GRID_MASTER.DELETE'))) return;await prisma.planningTaskMaster.update({where:{id:req.params.id},data:{isActive:false}});res.status(204).end();}));

app.get('/api/meetings', asyncRoute(async (req,res)=>{
  const permissionKey=req.query.inquiry_id?'INQUIRIES.VIEW':'PROJECTS.VIEW';
  if(!(await requireEffectivePermission(req,res,permissionKey))) return;
  const where=req.query.inquiry_id?{inquiryId:req.query.inquiry_id}:req.query.project_id?{projectId:req.query.project_id}:{};
  const rows=await prisma.meeting.findMany({where,include:meetingInclude,orderBy:[{meetingDate:'desc'},{startTime:'desc'}]});
  res.json(rows.map(serializeMeeting));
}));
app.post('/api/meetings', asyncRoute(async (req,res)=>{
  const b=req.body;
  if((b.inquiry_id?1:0)+(b.project_id?1:0)!==1) return res.status(400).json({error:'Meeting must belong to exactly one inquiry or project'});
  const permissionKey=b.inquiry_id?'INQUIRIES.FOLLOW_UP':'PROJECTS.UPDATE';
  if(!(await requireEffectivePermission(req,res,permissionKey))) return;
  const meetingType=b.meeting_type||'PROJECT';
  if(!b.meeting_date || !b.start_time || !String(b.agenda || '').trim()) return res.status(400).json({error:'Meeting date, start time and agenda are required.'});
  const userIds=[...new Set((b.user_ids||[]).filter(Boolean))];
  if(!userIds.length) return res.status(400).json({error:'Assign at least one user to the meeting.'});
  const validUsers=await prisma.user.findMany({where:{id:{in:userIds},isActive:true},select:{id:true}});
  if(validUsers.length!==userIds.length) return res.status(400).json({error:'One or more meeting users are invalid or inactive.'});
  if(meetingType==='KICKOFF' && b.inquiry_id){
    const existing=await prisma.meeting.findFirst({where:{inquiryId:b.inquiry_id,meetingType:'KICKOFF'}});
    if(existing) return res.status(409).json({error:'This inquiry already has a kickoff meeting.'});
  }
  const meeting=await prisma.$transaction(async (tx)=>{
    const created=await tx.meeting.create({data:{inquiryId:b.inquiry_id||null,projectId:b.project_id||null,meetingType,title:String(b.title || (meetingType==='KICKOFF'?'Kickoff Meeting':'Project Meeting')).trim(),agenda:String(b.agenda).trim(),meetingDate:new Date(b.meeting_date),startTime:meetingTimeDate(b.start_time),endTime:b.end_time?meetingTimeDate(b.end_time):null,location:b.location||null,meetingLink:b.meeting_link||null,createdById:req.user?.id||null,attendees:{create:userIds.map((userId)=>({userId}))}}});
    await createMeetingNotification(tx,req,created,userIds,meetingType==='KICKOFF'?'KICKOFF_MEETING_CREATED':'PROJECT_MEETING_CREATED');
    return created;
  });
  await writeAudit(req,{module:'MEETINGS',action:'CREATE',recordId:meeting.id,newValues:b});
  const full=await prisma.meeting.findUnique({where:{id:meeting.id},include:meetingInclude});
  res.status(201).json(serializeMeeting(full));
}));

app.get('/api/notifications', asyncRoute(async (req,res)=>{ if(!(await requireEffectivePermission(req,res,'NOTIFICATIONS.VIEW'))) return; res.json(await listNotifications(req.user?.id || null)); }));
app.patch('/api/notifications/:id/read', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'NOTIFICATIONS.VIEW'))) return;
  if(!req.user?.id)return res.status(400).json({error:'No active user is available for notifications.'});
  const notification=await prisma.notification.findUnique({where:{id:req.params.id},select:{id:true}});
  if(!notification)return res.status(404).json({error:'Notification not found'});
  await prisma.notificationRecipient.updateMany({where:{notificationId:req.params.id,userId:req.user.id},data:{isRead:true,readAt:new Date()}});
  res.json({ok:true});
}));
app.patch('/api/notifications/read-all', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'NOTIFICATIONS.VIEW'))) return;
  if(!req.user?.id)return res.status(400).json({error:'No active user is available for notifications.'});
  const notifications=await prisma.notification.findMany({where:{createdAt:{gte:notificationWeekStart()}},select:{id:true}});
  await prisma.notificationRecipient.updateMany({where:{userId:req.user.id,notificationId:{in:notifications.map((row)=>row.id)}},data:{isRead:true,readAt:new Date()}});
  res.json({ok:true});
}));

const parseJsonValue = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};
const ticketCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60);
const ticketSlaDueAt = (slaDays, now = new Date()) => Number(slaDays) > 0 ? new Date(now.getTime() + (Number(slaDays) * 86400000)) : null;

async function ticketActorCanUseStatus(userId, status) {
  const actor=await prisma.user.findUnique({where:{id:userId},include:{role:true,userDepartments:true}});
  if(!actor?.isActive)return false;
  if(actor.role?.roleCode==='ADMIN')return true;
  const roles=asArray(status.allowedRoleCodes);
  const departments=asArray(status.allowedDepartmentIds);
  if(roles.length && !roles.includes(actor.role?.roleCode))return false;
  if(departments.length && !actor.userDepartments.some((row)=>departments.includes(row.departmentId)))return false;
  return true;
}

const ticketFieldVisible = (field, values) => {
  const condition=field?.condition;
  if(!condition?.field_key)return true;
  const actual=values?.[condition.field_key];
  if(condition.operator==='not_equals')return String(actual??'')!==String(condition.value??'');
  if(condition.operator==='includes')return Array.isArray(actual) ? actual.includes(condition.value) : String(actual??'').includes(String(condition.value??''));
  return String(actual??'')===String(condition.value??'');
};
const ticketFieldMissing = (value) => value===undefined || value===null || value==='' || (Array.isArray(value)&&value.length===0);
function validateTicketStatusResponse(status, values) {
  const errors=[];
  for(const field of asArray(status.dynamicFields)){
    if(field?.required && ticketFieldVisible(field,values) && ticketFieldMissing(values?.[field.key]))errors.push(`${field.label || field.key} is required.`);
  }
  return errors;
}

async function loadTicketFormVersion(versionId = null, activeOnly = false) {
  const where={formMaster:{formType:'TICKET'}};
  if(versionId)where.id=versionId;
  if(activeOnly)where.isActive=true;
  return prisma.formVersion.findFirst({
    where,
    include:{...versionInclude,formMaster:true},
    orderBy:versionId?undefined:{versionNo:'desc'},
  });
}

const ticketCoreOptionFields = {
  ticket_type:'__ticket_core_ticket_type',
  problem_type:'__ticket_core_problem_type',
  manufacturer:'__ticket_core_manufacturer',
  received_via:'__ticket_core_received_via',
  warranty_status:'__ticket_core_warranty_status',
  support_mode:'__ticket_core_support_mode',
  support_type:'__ticket_core_support_type',
  repair_location:'__ticket_core_repair_location',
  priority:'__ticket_core_priority',
};

function ticketVersionCoreOptions(version) {
  const result={};
  for(const section of version?.sections || []){
    for(const field of section.fields || []){
      const entry=Object.entries(ticketCoreOptionFields).find(([,fieldKey])=>field.fieldKey===fieldKey);
      if(entry)result[entry[0]]=(field.options || []).filter((option)=>option.isActive!==false).sort((a,b)=>a.displayOrder-b.displayOrder).map((option)=>option.optionLabel);
    }
  }
  return result;
}

function validateTicketCoreSelections(version, body) {
  const configured=ticketVersionCoreOptions(version);
  const labels={ticket_type:'Ticket Type',problem_type:'Problem Type',manufacturer:'Make / Manufacturer',received_via:'Received Through',warranty_status:'Warranty',support_mode:'Support Location',support_type:'Support Type',repair_location:'Repair Location',priority:'Priority'};
  const errors=[];
  for(const [key,options] of Object.entries(configured)){
    const value=String(body?.[key] || '').trim();
    if(value && options.length && !options.includes(value))errors.push(`${labels[key]} must use an option configured in this Ticket Form version.`);
  }
  return errors;
}

function validateTicketProblemType(ticketType, problemType) {
  const type=String(ticketType || '').trim().toLowerCase();
  const problem=String(problemType || '').trim().toLowerCase();
  const softwareProblems=new Set(['software','programming']);
  if(type==='hardware' && softwareProblems.has(problem))return ['Hardware tickets cannot use Software or Programming as Problem Type.'];
  if(type==='software' && !softwareProblems.has(problem))return ['Software tickets must use Software or Programming as Problem Type.'];
  return [];
}

function validateTicketFormData(version, values, phase=1) {
  if(!version)return [];
  const serialized=serializeVersion(version);
  const errors=[];
  for(const section of serialized.sections || []){
    if(section.is_active===false)continue;
    const sectionPhase=/^phase\s*2\b/i.test(section.title || '') ? 2 : /^phase\s*1\b/i.test(section.title || '') ? 1 : 0;
    if(sectionPhase && sectionPhase!==phase)continue;
    if(String(section.title || '').toLowerCase().includes('core dropdown'))continue;
    const groups=[section.fields || [],...(section.subsections || []).filter((subsection)=>subsection.is_active!==false).map((subsection)=>subsection.fields || [])];
    for(const fields of groups){
      for(const field of fields){
        if(field.is_active!==false && field.required && ticketFieldMissing(values?.[field.id]))errors.push(`${field.label || 'Configured field'} is required.`);
      }
    }
  }
  return errors;
}

async function ticketRuleUserIds(tx, ticket, rules = {}) {
  const ids=new Set();
  if(rules.assignee){
    const assignments=await tx.ticketAssignment.findMany({where:{ticketId:ticket.id,isActive:true,userId:{not:null}},select:{userId:true}});
    assignments.forEach((item)=>item.userId&&ids.add(item.userId));
  }
  if(rules.creator && ticket.createdById)ids.add(ticket.createdById);
  const roles=asArray(rules.roles);
  const departments=asArray(rules.departments);
  if(roles.length || departments.length){
    const users=await tx.user.findMany({where:{isActive:true,OR:[
      ...(roles.length?[{role:{roleCode:{in:roles}}}]:[]),
      ...(departments.length?[{userDepartments:{some:{departmentId:{in:departments}}}}]:[]),
    ]},select:{id:true}});
    users.forEach((user)=>ids.add(user.id));
  }
  return [...ids];
}

async function createTicketDocuments(tx,{ticketId,statusHistoryId=null,files=[],userId,documentRole=null}){
  if(!files.length)return [];
  const type=await tx.documentType.upsert({where:{documentTypeCode:'TICKET_ATTACHMENT'},update:{isActive:true},create:{documentTypeCode:'TICKET_ATTACHMENT',documentTypeName:'Ticket Attachment',isActive:true}});
  const created=[];
  for(const file of files){
    const checksum=crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
    const doc=await tx.document.create({data:{documentTypeId:type.id,fileName:file.filename,originalFileName:documentDisplayName(file.originalname,file.originalname),storagePath:file.path,mimeType:file.mimetype,fileSize:BigInt(file.size),checksum,uploadedById:userId}});
    const role=documentRole || (String(file.mimetype||'').startsWith('image/')?'PHOTO':'ATTACHMENT');
    await tx.ticketDocument.create({data:{ticketId,documentId:doc.id,statusHistoryId,description:statusHistoryId?'Status response attachment':role==='PHOTO'?'Ticket photo':'Ticket attachment',documentRole:role}});
    created.push(doc.id);
  }
  return created;
}

async function technicalTicketRecipientIds(tx) {
  const users=await tx.user.findMany({
    where:{isActive:true,role:{roleCode:{in:['ADMIN','HOD']}}},
    include:{role:true,userDepartments:{include:{department:true}}},
  });
  return users.filter((user)=>user.role?.roleCode==='ADMIN' || (user.userDepartments || []).some((membership)=>
    /technical|automation|design/i.test(membership.department?.departmentName || '')
  )).map((user)=>user.id);
}

async function syncTicketTimesheetAssignments(tx,ticket,userIds,departmentIds,actorId) {
  const users=userIds.length ? await tx.user.findMany({where:{id:{in:userIds},isActive:true},include:{userDepartments:true}}) : [];
  const activeKeys=[];
  for(const user of users){
    const sourceTaskKey=`TICKET:${ticket.id}:${user.id}`.slice(0,180);
    activeKeys.push(sourceTaskKey);
    const departmentId=(user.userDepartments || []).find((membership)=>departmentIds.includes(membership.departmentId))?.departmentId || departmentIds[0] || null;
    const data={
      title:`${ticket.ticketNo} - ${ticket.subject}`.slice(0,220),
      description:`Ticket Phase 2 technical work for ${ticket.ticketNo}`,
      taskSource:'TICKET',sourceTaskKey,ticketId:ticket.id,projectId:null,departmentId,
      assignedUserId:user.id,createdById:actorId,startDate:new Date(),dueDate:ticket.slaDueAt || null,
      status:'Pending',priority:ticket.priority,taskType:'Ticket',isArchived:false,
    };
    await tx.timesheetTask.upsert({where:{ticketId_sourceTaskKey:{ticketId:ticket.id,sourceTaskKey}},update:data,create:data});
  }
  await tx.timesheetTask.updateMany({
    where:{ticketId:ticket.id,taskSource:'TICKET',...(activeKeys.length?{sourceTaskKey:{notIn:activeKeys}}:{})},
    data:{isArchived:true},
  });
}

async function replaceTicketAssignments(tx,ticket,userIds,departmentIds,actorId) {
  await tx.ticketAssignment.updateMany({where:{ticketId:ticket.id,isActive:true},data:{isActive:false}});
  const users=userIds.length ? await tx.user.findMany({where:{id:{in:userIds},isActive:true},include:{userDepartments:true}}) : [];
  for(const departmentId of departmentIds){
    await tx.ticketAssignment.create({data:{ticketId:ticket.id,departmentId,assignedById:actorId}});
  }
  for(const user of users){
    const departmentId=(user.userDepartments || []).find((membership)=>departmentIds.includes(membership.departmentId))?.departmentId || null;
    await tx.ticketAssignment.create({data:{ticketId:ticket.id,userId:user.id,departmentId,assignedById:actorId}});
  }
  await syncTicketTimesheetAssignments(tx,ticket,users.map((user)=>user.id),departmentIds,actorId);
  return users.map((user)=>user.id);
}

async function ticketTimerAllowed(userId,ticketId) {
  const [actor,ticket]=await Promise.all([
    loadActorAccessContext(userId),
    prisma.ticket.findUnique({where:{id:ticketId},include:{assignments:true}}),
  ]);
  if(!ticket)return false;
  if(actor.roleCode==='ADMIN')return true;
  if(['HOD','TL'].includes(actor.roleCode))return actorCanAccessTicket(actor,ticket);
  return ticket.assignments.some((row)=>row.isActive!==false && row.userId===userId);
}

async function processTicketSla() {
  const overdue=await prisma.ticket.findMany({where:{closedAt:null,isOverdue:false,slaDueAt:{lt:new Date()}},include:{currentStatus:true}});
  for(const item of overdue){
    await prisma.$transaction(async(tx)=>{
      const changed=await tx.ticket.updateMany({where:{id:item.id,isOverdue:false},data:{isOverdue:true,overdueNotifiedAt:new Date()}});
      if(!changed.count)return;
      const recipientIds=await ticketRuleUserIds(tx,item,item.currentStatus?.escalationRules || {assignee:true,roles:['TL','HOD','ADMIN']});
      await createNotification(tx,{user:{id:null,email:'system'}},{eventType:'TICKET_SLA_OVERDUE',entityType:'TICKET',entityId:item.id,title:`Ticket overdue - ${item.ticketNo}`,message:`${item.ticketNo} exceeded the SLA for ${item.currentStatus?.statusName || 'its current status'}.`,payload:{ticket_no:item.ticketNo,status:item.currentStatus?.statusName,sla_due_at:item.slaDueAt},userIds:recipientIds});
    });
  }
  return overdue.length;
}

app.get('/api/tickets', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.VIEW')))return;
  await processTicketSla();
  const rows=await prisma.ticket.findMany({include:ticketInclude,orderBy:{createdAt:'desc'}});
  const actor=await loadActorAccessContext(req.user?.id);
  res.json(rows.filter((row)=>actorCanAccessTicket(actor,row)).map(serializeTicket));
}));
app.get('/api/tickets/:id', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.VIEW')))return;
  const row=await prisma.ticket.findUnique({where:{id:req.params.id},include:ticketInclude});
  if(!row)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,row)))return;
  res.json(serializeTicket(row));
}));

app.post('/api/tickets', upload.array('attachments',10), asyncRoute(async(req,res)=>{
  const files=req.files || [];
  if(!(await requireEffectivePermission(req,res,'TICKETS.CREATE'))){cleanupUploads(files);return;}
  const creatorActor=await loadActorAccessContext(req.user?.id);
  if(!actorCanWriteTickets(creatorActor)){cleanupUploads(files);return res.status(403).json({error:'Only the Automation and Store departments can create tickets.'});}
  const b=req.body || {};
  const required=[['subject','Subject'],['customer_id','Customer'],['ticket_type','Ticket Type'],['problem_type','Problem Type'],['model_number','Model Number'],['complaint','Problem Description'],['support_mode','Support Location'],['support_type','Support Type']];
  const missing=required.filter(([key])=>!String(b[key]||'').trim()).map(([,label])=>label);
  if(missing.length){
    cleanupUploads(files);return res.status(400).json({error:`${missing.join(', ')} ${missing.length===1?'is':'are'} required.`});
  }
  const ticketData=parseJsonValue(b.ticket_data,{});
  const [customer,status,actor,ticketFormVersion]=await Promise.all([
    prisma.customer.findUnique({where:{id:b.customer_id}}),
    prisma.ticketWorkflowStatus.findFirst({where:{isActive:true},orderBy:[{sequence:'asc'},{statusName:'asc'}]}),
    prisma.user.findUnique({where:{id:req.user.id},include:{userDepartments:{orderBy:{isPrimary:'desc'}}}}),
    loadTicketFormVersion(null,true),
  ]);
  if(!customer){cleanupUploads(files);return res.status(400).json({error:'Choose a valid customer.'});}
  if(!status){cleanupUploads(files);return res.status(409).json({error:'No active Ticket workflow status is configured.'});}
  const ticketFormErrors=validateTicketFormData(ticketFormVersion,ticketData,1);
  if(ticketFormErrors.length){cleanupUploads(files);return res.status(400).json({error:ticketFormErrors.join(' ')});}
  const ticketCoreErrors=validateTicketCoreSelections(ticketFormVersion,b);
  if(ticketCoreErrors.length){cleanupUploads(files);return res.status(400).json({error:ticketCoreErrors.join(' ')});}
  const problemTypeErrors=validateTicketProblemType(b.ticket_type,b.problem_type);
  if(problemTypeErrors.length){cleanupUploads(files);return res.status(400).json({error:problemTypeErrors.join(' ')});}
  try{await validateDynamicMobileFields(prisma,{dynamic_data:ticketData});}catch(error){cleanupUploads(files);throw error;}
  let committed=false;
  try{
    const now=new Date(); const dueAt=ticketSlaDueAt(status.slaDays,now);
    const created=await prisma.$transaction(async(tx)=>{
      const count=await tx.ticket.count();
      const ticketNo=`TKT-${now.getUTCFullYear()}-${String(count+1).padStart(5,'0')}`;
      const ticket=await tx.ticket.create({data:{
        ticketNo,subject:String(b.subject).trim(),customerId:b.customer_id,ticketType:String(b.ticket_type).trim(),problemType:String(b.problem_type).trim(),
        manufacturer:String(b.manufacturer||'').trim()||null,modelNumber:String(b.model_number).trim(),receivedVia:String(b.received_via||'').trim()||null,
        warrantyStatus:String(b.warranty_status||'').trim()||null,supportMode:String(b.support_mode||'').trim()||null,supportType:String(b.support_type||'').trim()||null,
        complaint:String(b.complaint).trim(),customerComment:String(b.customer_comment||'').trim()||null,priority:String(b.priority||'Medium'),
        inquiryId:b.inquiry_id||null,projectId:b.project_id||null,formVersionId:ticketFormVersion?.id||null,currentPhase:1,phase1Data:ticketData,phase1SubmittedAt:now,
        currentStatusId:status.id,statusEnteredAt:now,slaDueAt:dueAt,createdById:req.user.id,createdDepartmentId:actor?.userDepartments?.[0]?.departmentId||null,
      }});
      const history=await tx.ticketStatusHistory.create({data:{ticketId:ticket.id,toStatusId:status.id,responseData:{phase:1,submitted:true},slaDaysSnapshot:status.slaDays,slaDueAt:dueAt,changedById:req.user.id}});
      await createTicketDocuments(tx,{ticketId:ticket.id,statusHistoryId:history.id,files,userId:req.user.id});
      const recipientIds=await technicalTicketRecipientIds(tx);
      await createNotification(tx,req,{eventType:'TICKET_PHASE_1_SUBMITTED',entityType:'TICKET',entityId:ticket.id,title:`Ticket submitted - ${ticket.ticketNo}`,message:`${ticket.ticketNo} was submitted for ${customer.customerName} and is ready for technical review.`,payload:{ticket_no:ticket.ticketNo,phase:1,status:status.statusName},userIds:recipientIds});
      return ticket;
    });
    committed=true;
    await writeAudit(req,{module:'TICKETS',action:'PHASE_1_SUBMIT',recordId:created.id,newValues:{ticket_no:created.ticketNo,customer_id:b.customer_id,ticket_type:b.ticket_type,problem_type:b.problem_type,model_number:b.model_number,priority:b.priority,status:status.statusName,ticket_form_version_id:ticketFormVersion?.id||null,ticket_data:ticketData,attachment_count:files.length}});
    res.status(201).json({id:created.id,ticket_no:created.ticketNo});
  }catch(error){if(!committed)cleanupUploads(files);throw error;}
}));

app.patch('/api/tickets/:id', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.UPDATE')))return;
  const old=await prisma.ticket.findUnique({where:{id:req.params.id},include:{assignments:true}});
  if(!old)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,old)))return;
  const editorActor=await loadActorAccessContext(req.user?.id);
  if(!actorCanWriteTickets(editorActor))return res.status(403).json({error:'Only the Automation and Store departments can edit tickets.'});
  const b=req.body || {};
  const ticketData=Object.prototype.hasOwnProperty.call(b,'ticket_data')?parseJsonValue(b.ticket_data,{}):undefined;
  const ticketFormVersion=old.formVersionId?await loadTicketFormVersion(old.formVersionId,false):await loadTicketFormVersion(null,true);
  if(ticketData){const errors=validateTicketFormData(ticketFormVersion,ticketData,1);if(errors.length)return res.status(400).json({error:errors.join(' ')});}
  const coreErrors=validateTicketCoreSelections(ticketFormVersion,b);if(coreErrors.length)return res.status(400).json({error:coreErrors.join(' ')});
  const problemTypeErrors=validateTicketProblemType(b.ticket_type===undefined?old.ticketType:b.ticket_type,b.problem_type===undefined?old.problemType:b.problem_type);
  if(problemTypeErrors.length)return res.status(400).json({error:problemTypeErrors.join(' ')});
  const updated=await prisma.ticket.update({where:{id:old.id},data:{
    subject:b.subject===undefined?undefined:String(b.subject).trim(),customerId:b.customer_id||undefined,ticketType:b.ticket_type||undefined,problemType:b.problem_type||undefined,
    manufacturer:b.manufacturer===undefined?undefined:(String(b.manufacturer).trim()||null),modelNumber:b.model_number===undefined?undefined:String(b.model_number).trim(),
    receivedVia:b.received_via===undefined?undefined:(String(b.received_via).trim()||null),warrantyStatus:b.warranty_status===undefined?undefined:(String(b.warranty_status).trim()||null),
    supportMode:b.support_mode===undefined?undefined:(String(b.support_mode).trim()||null),supportType:b.support_type===undefined?undefined:(String(b.support_type).trim()||null),
    complaint:b.complaint===undefined?undefined:String(b.complaint).trim(),customerComment:b.customer_comment===undefined?undefined:(String(b.customer_comment).trim()||null),priority:b.priority||undefined,
    inquiryId:b.inquiry_id===undefined?undefined:(b.inquiry_id||null),projectId:b.project_id===undefined?undefined:(b.project_id||null),phase1Data:ticketData,
  }});
  await writeAudit(req,{module:'TICKETS',action:'UPDATE',recordId:old.id,oldValues:{subject:old.subject,customer_id:old.customerId,ticket_type:old.ticketType,problem_type:old.problemType,manufacturer:old.manufacturer,model_number:old.modelNumber,priority:old.priority},newValues:b});
  res.json({id:updated.id});
}));


// ---- Phase 2: "Repairing should be done by" -------------------------------------------------
const isInHouseRepair = (value) => /in[\s-]?house|store/i.test(String(value || ''));
function normalizeRepairDetails(repairLocation, raw) {
  if(isInHouseRepair(repairLocation))return {errors:[],details:{mode:'IN_HOUSE'}};
  const source=raw && typeof raw==='object' ? raw : {};
  const errors=[];
  const companyName=String(source.company_name || '').trim().replace(/\s+/g,' ');
  const contactNumber=String(source.contact_number || '').trim();
  const paymentRaw=source.payment_amount;
  if(!companyName)errors.push('Company / repairer name is required.');
  else if(companyName.length>160)errors.push('Company / repairer name must be 160 characters or less.');
  if(!contactNumber)errors.push('Contact number is required.');
  else if(!/^\d{10}$/.test(contactNumber))errors.push('Contact number must be exactly 10 digits (numbers only).');
  let paymentAmount=null;
  if(paymentRaw!==undefined && paymentRaw!==null && String(paymentRaw).trim()!==''){
    const amount=Number(String(paymentRaw).trim());
    if(!Number.isFinite(amount) || amount<0 || amount>9999999999.99)errors.push('Payment amount must be a valid amount of 0 or more.');
    else paymentAmount=Math.round(amount*100)/100;
  }
  return {errors,details:{mode:'EXTERNAL',company_name:companyName,contact_number:contactNumber,payment_amount:paymentAmount}};
}

app.put('/api/tickets/:id/phase-2', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.ASSIGN')))return;
  const old=await prisma.ticket.findUnique({where:{id:req.params.id},include:{currentStatus:true,assignments:true}});
  if(!old)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,old)))return;
  const b=req.body || {};
  const repairLocation=String(b.repair_location || '').trim();
  const userIds=[...new Set(asArray(b.user_ids).map(String).filter(Boolean))];
  const departmentIds=[...new Set(asArray(b.department_ids).map(String).filter(Boolean))];
  const phase2Data=parseJsonValue(b.phase_2_data,{});
  if(!repairLocation)return res.status(400).json({error:'Repairing should be done by is required.'});
  const inHouse=isInHouseRepair(repairLocation);
  const repair=normalizeRepairDetails(repairLocation,parseJsonValue(b.repair_details,{}));
  if(repair.errors.length)return res.status(400).json({error:repair.errors.join(' ')});
  if(inHouse){
    if(!departmentIds.length)return res.status(400).json({error:'Choose the department for in-house repair.'});
    if(!userIds.length)return res.status(400).json({error:'Assign at least one employee.'});
  }
  const ticketFormVersion=old.formVersionId?await loadTicketFormVersion(old.formVersionId,false):await loadTicketFormVersion(null,true);
  const configuredErrors=validateTicketFormData(ticketFormVersion,phase2Data,2);
  if(configuredErrors.length)return res.status(400).json({error:configuredErrors.join(' ')});
  const coreErrors=validateTicketCoreSelections(ticketFormVersion,{repair_location:repairLocation});
  if(coreErrors.length)return res.status(400).json({error:coreErrors.join(' ')});
  try{await validateDynamicMobileFields(prisma,{dynamic_data:phase2Data});}catch(error){throw error;}

  const result=await prisma.$transaction(async(tx)=>{
    // In-house: department + employees of that department. External repair: no internal assignment.
    const validDepartments=inHouse&&departmentIds.length?await tx.department.findMany({where:{id:{in:departmentIds},isActive:true},select:{id:true}}):[];
    const validDepartmentIds=validDepartments.map((item)=>item.id);
    if(inHouse){
      if(!validDepartmentIds.length)throw Object.assign(new Error('Choose an active department for in-house repair.'),{statusCode:400});
      const members=await tx.user.findMany({where:{id:{in:userIds},isActive:true},include:{userDepartments:true}});
      const outside=members.filter((user)=>!(user.userDepartments||[]).some((row)=>validDepartmentIds.includes(row.departmentId)));
      if(outside.length)throw Object.assign(new Error('Selected employees must belong to the chosen department.'),{statusCode:400});
    }
    const assignedUserIds=await replaceTicketAssignments(tx,old,inHouse?userIds:[],validDepartmentIds,req.user.id);
    if(inHouse&&!assignedUserIds.length)throw Object.assign(new Error('Choose active employees for assignment.'),{statusCode:400});
    const assignedStatus=await tx.ticketWorkflowStatus.findFirst({where:{statusCode:'ASSIGNED',isActive:true}});
    const now=new Date();
    const targetStatus=assignedStatus || old.currentStatus;
    const statusChanged=targetStatus?.id && targetStatus.id!==old.currentStatusId;
    const dueAt=statusChanged?ticketSlaDueAt(targetStatus.slaDays,now):old.slaDueAt;
    const updated=await tx.ticket.update({where:{id:old.id},data:{
      repairLocation,repairDetails:repair.details,currentPhase:2,phase2Data,phase2SubmittedAt:now,
      ...(statusChanged?{currentStatusId:targetStatus.id,statusEnteredAt:now,slaDueAt:dueAt,isOverdue:false,overdueNotifiedAt:null}:{}),
    }});
    if(statusChanged)await tx.ticketStatusHistory.create({data:{ticketId:old.id,fromStatusId:old.currentStatusId,toStatusId:targetStatus.id,responseData:{phase:2,repair_location:repairLocation,repair_details:repair.details,assigned_user_ids:assignedUserIds,assigned_department_ids:validDepartmentIds},note:'Phase 2 technical assignment',slaDaysSnapshot:targetStatus.slaDays,slaDueAt:dueAt,changedById:req.user.id}});
    await createNotification(tx,req,{eventType:'TICKET_PHASE_2_ASSIGNED',entityType:'TICKET',entityId:old.id,title:`Ticket assigned - ${old.ticketNo}`,message:`${old.ticketNo} has been assigned for ${repairLocation} work.`,payload:{ticket_no:old.ticketNo,phase:2,repair_location:repairLocation,repair_details:repair.details},userIds:assignedUserIds});
    return {updated,assignedUserIds,statusName:targetStatus?.statusName || old.currentStatus?.statusName};
  });
  await writeAudit(req,{module:'TICKETS',action:'PHASE_2_ASSIGN',recordId:old.id,oldValues:{phase:old.currentPhase,repair_location:old.repairLocation},newValues:{phase:2,repair_location:repairLocation,repair_details:repair.details,user_ids:result.assignedUserIds,department_ids:departmentIds,phase_2_data:phase2Data,status:result.statusName}});
  res.json({id:old.id,assigned_user_ids:result.assignedUserIds,status:result.statusName});
}));

app.post('/api/tickets/:id/timer', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.VIEW')))return;
  if(!(await ticketTimerAllowed(req.user.id,req.params.id)))return res.status(403).json({error:'Only assigned employees, TL, HOD or Admin can use this timer.'});
  const ticket=await prisma.ticket.findUnique({where:{id:req.params.id}});
  if(!ticket)return res.status(404).json({error:'Ticket not found.'});
  const action=String(req.body.action || '').toUpperCase();
  if(!['START','PAUSE','RESUME','STOP'].includes(action))return res.status(400).json({error:'Timer action must be Start, Pause, Resume or Stop.'});
  const active=await prisma.ticketWorkSession.findFirst({where:{ticketId:ticket.id,userId:req.user.id,status:{in:['RUNNING','PAUSED']}},orderBy:{startedAt:'desc'}});
  const now=new Date();
  const elapsedSinceResume=(session)=>session.status==='RUNNING'&&session.lastResumedAt?Math.max(0,Math.floor((now-session.lastResumedAt)/1000)):0;
  let session;
  if(action==='START'){
    if(active)return res.status(409).json({error:'You already have an active timer for this ticket.'});
    session=await prisma.ticketWorkSession.create({data:{ticketId:ticket.id,userId:req.user.id,status:'RUNNING',startedAt:now,lastResumedAt:now,remarks:String(req.body.remarks||'').trim()||null}});
  }else{
    if(!active)return res.status(409).json({error:'No active timer was found for this ticket.'});
    if(action==='PAUSE'&&active.status!=='RUNNING')return res.status(409).json({error:'Only a running timer can be paused.'});
    if(action==='RESUME'&&active.status!=='PAUSED')return res.status(409).json({error:'Only a paused timer can be resumed.'});
    const seconds=active.elapsedSeconds+elapsedSinceResume(active);
    session=await prisma.ticketWorkSession.update({where:{id:active.id},data:{
      status:action==='STOP'?'STOPPED':action==='PAUSE'?'PAUSED':'RUNNING',
      elapsedSeconds:seconds,lastResumedAt:action==='RESUME'?now:null,pausedAt:action==='PAUSE'?now:null,stoppedAt:action==='STOP'?now:null,
      remarks:req.body.remarks===undefined?undefined:(String(req.body.remarks).trim()||null),
    }});
  }
  const currentSessionSeconds=session.elapsedSeconds+(session.status==='RUNNING'&&session.lastResumedAt?Math.max(0,Math.floor((now-session.lastResumedAt)/1000)):0);
  const allSessions=await prisma.ticketWorkSession.findMany({where:{ticketId:ticket.id,userId:req.user.id},select:{id:true,status:true,elapsedSeconds:true,lastResumedAt:true}});
  const totalSeconds=allSessions.reduce((sum,item)=>sum+item.elapsedSeconds+(item.status==='RUNNING'&&item.lastResumedAt?Math.max(0,Math.floor((now-item.lastResumedAt)/1000)):0),0);
  const task=await prisma.timesheetTask.findFirst({where:{ticketId:ticket.id,assignedUserId:req.user.id,taskSource:'TICKET'}});
  if(task)await prisma.timesheetTask.update({where:{id:task.id},data:{status:'In Progress',actualHours:Number((totalSeconds/3600).toFixed(2))}});
  await writeAudit(req,{module:'TICKETS',action:`TIMER_${action}`,recordId:ticket.id,newValues:{session_id:session.id,session_seconds:currentSessionSeconds,total_seconds:totalSeconds}});
  res.json({id:session.id,status:session.status,session_seconds:currentSessionSeconds,total_seconds:totalSeconds,started_at:session.startedAt,last_resumed_at:session.lastResumedAt,paused_at:session.pausedAt,stopped_at:session.stoppedAt});
}));

app.put('/api/tickets/:id/rma', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.UPDATE')))return;
  const old=await prisma.ticket.findUnique({where:{id:req.params.id},include:{assignments:true}});
  if(!old)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,old)))return;
  const rmaData=parseJsonValue(req.body.rma_data,{});
  const rmaNo=String(req.body.rma_no||old.rmaNo||`RMA-${new Date().getUTCFullYear()}-${old.ticketNo.split('-').pop()}`).trim();
  const updated=await prisma.ticket.update({where:{id:old.id},data:{rmaNo,rmaData,rmaGeneratedAt:new Date()}});
  await writeAudit(req,{module:'TICKETS',action:'RMA_UPDATE',recordId:old.id,oldValues:{rma_no:old.rmaNo,rma_data:old.rmaData},newValues:{rma_no:rmaNo,rma_data:rmaData}});
  res.json({id:updated.id,rma_no:updated.rmaNo});
}));

app.get('/api/tickets/:id/pdf', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.VIEW')))return;
  const row=await prisma.ticket.findUnique({where:{id:req.params.id},include:ticketInclude});
  if(!row)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,row)))return;
  const ticket=serializeTicket(row);
  const formVersion=row.formVersionId?await loadTicketFormVersion(row.formVersionId,false):null;
  const sections=formVersion?serializeVersion(formVersion).sections:[];
  res.type('application/pdf').set('Content-Disposition',`attachment; filename="${buildTicketPdfFileName(ticket)}"`).send(buildTicketPdf(ticket,{sections}));
}));

app.get('/api/tickets/:id/rma/pdf', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKETS.VIEW')))return;
  const row=await prisma.ticket.findUnique({where:{id:req.params.id},include:ticketInclude});
  if(!row)return res.status(404).json({error:'Ticket not found.'});
  if(!(await requireTicketRecordAccess(req,res,row)))return;
  if(!row.rmaNo)return res.status(409).json({error:'Save the RMA details before downloading the RMA document.'});
  const ticket=serializeTicket(row);
  res.type('application/pdf').set('Content-Disposition',`attachment; filename="${ticket.rma_no}.pdf"`).send(buildTicketRmaPdf(ticket));
}));

app.post('/api/tickets/:id/status', upload.fields([{name:'statusAttachments',maxCount:10}]), asyncRoute(async(req,res)=>{
  const files=req.files?.statusAttachments || [];
  if(!(await requireEffectivePermission(req,res,'TICKETS.STATUS_CHANGE'))){cleanupUploads(files);return;}
  const ticket=await prisma.ticket.findUnique({where:{id:req.params.id},include:{currentStatus:true,assignments:true}});
  if(!ticket){cleanupUploads(files);return res.status(404).json({error:'Ticket not found.'});}
  if(!(await requireTicketRecordAccess(req,res,ticket))){cleanupUploads(files);return;}
  const target=await prisma.ticketWorkflowStatus.findFirst({where:{id:String(req.body.status_id||''),isActive:true}});
  if(!target){cleanupUploads(files);return res.status(400).json({error:'Choose an active workflow status.'});}
  if(target.id===ticket.currentStatusId){cleanupUploads(files);return res.status(400).json({error:'Ticket is already in this status.'});}
  const allowed=asArray(ticket.currentStatus.allowedNextStatusCodes);
  if(allowed.length && !allowed.includes(target.statusCode)){cleanupUploads(files);return res.status(400).json({error:`${target.statusName} is not an allowed next status.`});}
  if(!(await ticketActorCanUseStatus(req.user.id,target))){cleanupUploads(files);return res.status(403).json({error:'Your role or department cannot use this status.'});}
  const responseData=parseJsonValue(req.body.response_data,{});
  const ticketFormVersion=ticket.formVersionId ? await loadTicketFormVersion(ticket.formVersionId,false) : null;
  const coreOptions=ticketVersionCoreOptions(ticketFormVersion);
  for(const field of asArray(target.dynamicFields)){
    const optionKey=field.type==='product'?'problem_type':null;
    const value=optionKey ? String(responseData[field.key] || '').trim() : '';
    if(value && coreOptions[optionKey]?.length && !coreOptions[optionKey].includes(value)){
      cleanupUploads(files);return res.status(400).json({error:`${field.label || field.key} must use an option configured in this Ticket Form version.`});
    }
  }
  for(const field of asArray(target.dynamicFields).filter((field)=>field.type==='file')){
    if(files.length && ticketFieldMissing(responseData[field.key]))responseData[field.key]=files.map((file)=>file.originalname);
  }
  const errors=validateTicketStatusResponse(target,responseData);
  if(errors.length){cleanupUploads(files);return res.status(400).json({error:errors.join(' ')});}
  let committed=false;
  try{
    const now=new Date(); const dueAt=target.statusCategory==='CLOSED'?null:ticketSlaDueAt(target.slaDays,now);
    const result=await prisma.$transaction(async(tx)=>{
      const history=await tx.ticketStatusHistory.create({data:{ticketId:ticket.id,fromStatusId:ticket.currentStatusId,toStatusId:target.id,responseData,note:String(req.body.note||'').trim()||null,slaDaysSnapshot:target.slaDays,slaDueAt:dueAt,wasOverdue:ticket.isOverdue||!!(ticket.slaDueAt&&ticket.slaDueAt<now),changedById:req.user.id}});
      const updated=await tx.ticket.update({where:{id:ticket.id},data:{currentStatusId:target.id,statusEnteredAt:now,slaDueAt:dueAt,isOverdue:false,overdueNotifiedAt:null,closedAt:target.statusCategory==='CLOSED'?now:null}});
      await createTicketDocuments(tx,{ticketId:ticket.id,statusHistoryId:history.id,files,userId:req.user.id});
      const recipientIds=await ticketRuleUserIds(tx,updated,target.notificationRules || {assignee:true,creator:true,roles:['ADMIN']});
      await createNotification(tx,req,{eventType:'TICKET_STATUS_CHANGED',entityType:'TICKET',entityId:ticket.id,title:`Ticket status - ${ticket.ticketNo}`,message:`${ticket.ticketNo} moved from ${ticket.currentStatus.statusName} to ${target.statusName}.`,payload:{ticket_no:ticket.ticketNo,from_status:ticket.currentStatus.statusName,to_status:target.statusName,status_history_id:history.id},userIds:recipientIds});
      return history;
    });
    committed=true;
    await writeAudit(req,{module:'TICKETS',action:'STATUS_CHANGE',recordId:ticket.id,oldValues:{status:ticket.currentStatus.statusName},newValues:{status:target.statusName,response_data:responseData,status_history_id:result.id}});
    res.json({id:ticket.id,status:target.statusName,status_history_id:result.id});
  }catch(error){if(!committed)cleanupUploads(files);throw error;}
}));

app.get('/api/ticket-master-options', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKET_MASTER.VIEW')))return;
  res.json([]);
}));
app.post('/api/ticket-master-options', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKET_MASTER.CREATE')))return;
  res.status(410).json({error:'Ticket choices are now managed inside each Ticket Form version.'});
}));
app.patch('/api/ticket-master-options/:id', asyncRoute(async(req,res)=>{
  if(!(await requireEffectivePermission(req,res,'TICKET_MASTER.UPDATE')))return;
  res.status(410).json({error:'Ticket choices are now managed inside each Ticket Form version.'});
}));

const normalizeTicketWorkflowBody = (body, old={}) => ({
  statusCode:ticketCode(body.status_code ?? old.statusCode), statusName:String(body.status_name ?? old.statusName ?? '').trim(),
  statusCategory:ticketCode(body.status_category ?? old.statusCategory ?? 'ACTIVE'), sequence:Number(body.sequence ?? old.sequence ?? 0),
  color:/^#[0-9a-f]{6}$/i.test(String(body.color ?? old.color ?? ''))?String(body.color ?? old.color):'#2563eb',
  slaDays:Math.max(0,Math.min(365,Number(body.sla_days ?? old.slaDays ?? 3)||0)), popupRequired:toBool(body.popup_required,old.popupRequired ?? false),
  dynamicFields:asArray(body.dynamic_fields ?? old.dynamicFields), allowedNextStatusCodes:asArray(body.allowed_next_status_codes ?? old.allowedNextStatusCodes).map(ticketCode),
  allowedRoleCodes:asArray(body.allowed_role_codes ?? old.allowedRoleCodes).map(ticketCode), allowedDepartmentIds:asArray(body.allowed_department_ids ?? old.allowedDepartmentIds),
  notificationRules:body.notification_rules ?? old.notificationRules ?? {}, escalationRules:body.escalation_rules ?? old.escalationRules ?? {}, isActive:toBool(body.is_active,old.isActive ?? true),
});
app.get('/api/ticket-workflows', asyncRoute(async(req,res)=>{if(!(await requireEffectivePermission(req,res,'TICKET_WORKFLOW.VIEW')))return;const rows=await prisma.ticketWorkflowStatus.findMany({orderBy:[{sequence:'asc'},{statusName:'asc'}]});res.json(rows.map(serializeTicketWorkflow));}));
app.post('/api/ticket-workflows', asyncRoute(async(req,res)=>{if(!(await requireEffectivePermission(req,res,'TICKET_WORKFLOW.CREATE')))return;const data=normalizeTicketWorkflowBody(req.body);if(!data.statusCode||!data.statusName)return res.status(400).json({error:'Status code and name are required.'});const row=await prisma.ticketWorkflowStatus.create({data});await writeAudit(req,{module:'TICKET_WORKFLOW',action:'CREATE',recordId:row.id,newValues:serializeTicketWorkflow(row)});res.status(201).json({id:row.id});}));
app.patch('/api/ticket-workflows/:id', asyncRoute(async(req,res)=>{if(!(await requireEffectivePermission(req,res,'TICKET_WORKFLOW.UPDATE')))return;const old=await prisma.ticketWorkflowStatus.findUnique({where:{id:req.params.id}});if(!old)return res.status(404).json({error:'Ticket workflow status not found.'});const data=normalizeTicketWorkflowBody(req.body,old);if(!data.isActive&&old.isActive){const [used,activeOthers]=await Promise.all([prisma.ticket.count({where:{currentStatusId:old.id}}),prisma.ticketWorkflowStatus.count({where:{id:{not:old.id},isActive:true}})]);if(used)return res.status(409).json({error:'Move active tickets to another status before deactivating this status.'});if(!activeOthers)return res.status(409).json({error:'At least one Ticket workflow status must remain active.'});}const row=await prisma.ticketWorkflowStatus.update({where:{id:old.id},data});await writeAudit(req,{module:'TICKET_WORKFLOW',action:'UPDATE',recordId:row.id,oldValues:serializeTicketWorkflow(old),newValues:serializeTicketWorkflow(row)});res.json({id:row.id});}));
app.post('/api/tickets/sla/process', asyncRoute(async(req,res)=>{if(!(await requireEffectivePermission(req,res,'TICKET_WORKFLOW.UPDATE')))return;res.json({processed:await processTicketSla()});}));

app.post('/api/documents/upload', upload.single('file'), asyncRoute(async (req,res)=>{
  if(!req.file)return res.status(400).json({error:'file is required'});
  const {record_type,record_id,document_type_id,description,version_no,document_name}=req.body;
  if(!['inquiry','project','ticket'].includes(record_type)){cleanupUpload(req.file);return res.status(400).json({error:'record_type must be inquiry, project or ticket'});}
  let recordExists=null;
  if(record_type==='inquiry'){
    if(!(await hasEffectivePermission(req.user?.id,'INQUIRIES.VIEW'))){cleanupUpload(req.file);return res.status(403).json({error:'Inquiry access is required to add an inquiry document.'});}
    recordExists=await prisma.inquiry.findUnique({where:{id:record_id},select:{id:true}});
  }else if(record_type==='project'){
    const canEditProject=await hasEffectivePermission(req.user?.id,'PROJECTS.UPDATE');
    const canUploadDocs=await hasEffectivePermission(req.user?.id,'PROJECTS.UPLOAD_DOCUMENTS');
    if(!canEditProject && !canUploadDocs){cleanupUpload(req.file);return res.status(403).json({error:'Project edit or document-upload permission is required to add a project document.'});}
    recordExists=await prisma.project.findUnique({where:{id:record_id},include:projectInclude});
    if(recordExists && !(await requireProjectRecordAccess(req,res,recordExists))){cleanupUpload(req.file);return;}
  }else{
    recordExists=await prisma.ticket.findUnique({where:{id:record_id},include:{assignments:true}});
    const canUpdate=await hasEffectivePermission(req.user?.id,'TICKETS.UPDATE');
    const canCreateOwn=recordExists?.createdById===req.user?.id && await hasEffectivePermission(req.user?.id,'TICKETS.CREATE');
    if(!canUpdate && !canCreateOwn){cleanupUpload(req.file);return res.status(403).json({error:'Ticket edit permission is required to add a ticket document.'});}
    if(recordExists && !(await requireTicketRecordAccess(req,res,recordExists))){cleanupUpload(req.file);return;}
  }
  if(!recordExists){cleanupUpload(req.file);return res.status(404).json({error:'Related record not found'});}
  if(!document_type_id){cleanupUpload(req.file);return res.status(400).json({error:'document_type_id is required'});}
  const type=await prisma.documentType.findUnique({where:{id:document_type_id}});
  if(!type || !type.isActive){cleanupUpload(req.file);return res.status(400).json({error:'Selected document type is invalid or inactive.'});}
  let committed=false;
  try{
    const checksum=crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
    const doc=await prisma.$transaction(async(tx)=>{
      const displayName=documentDisplayName(document_name,req.file.originalname);
      const created=await tx.document.create({data:{documentTypeId:document_type_id,fileName:req.file.filename,originalFileName:displayName,storagePath:req.file.path,mimeType:req.file.mimetype,fileSize:BigInt(req.file.size),versionNo:Number(version_no||1),checksum,uploadedById:req.user?.id||null}});
      if(record_type==='inquiry')await tx.inquiryDocument.create({data:{inquiryId:record_id,documentId:created.id,description:description||null}});
      else if(record_type==='project')await tx.projectDocument.create({data:{projectId:record_id,documentId:created.id,description:description||null}});
      else await tx.ticketDocument.create({data:{ticketId:record_id,documentId:created.id,description:description||null,documentRole:String(req.file.mimetype||'').startsWith('image/')?'PHOTO':'ATTACHMENT'}});
      return created;
    });
    committed=true;
    await writeAudit(req,{module:'DOCUMENTS',action:'UPLOAD',recordId:doc.id,newValues:{record_type,record_id,document_type_id,document_name:documentDisplayName(document_name,req.file.originalname),original_upload_name:req.file.originalname}});
    res.status(201).json({id:doc.id});
  }catch(error){if(!committed)cleanupUpload(req.file);throw error;}
}));
app.get('/api/documents/:id/download', asyncRoute(async (req,res)=>{
  const d=await prisma.document.findUnique({
    where:{id:req.params.id},
    include:{
      inquiries:{where:{isActive:true},select:{inquiryId:true}},
      projects:{where:{isActive:true},select:{projectId:true}},
      tickets:{select:{ticketId:true}},
    },
  });
  // Return 404 for missing and unauthorized IDs so document enumeration does not reveal existence.
  if(!d || !d.isActive) return res.status(404).json({error:'Document not found'});

  const actor=await loadActorAccessContext(req.user?.id);
  const [inquiryPermission,projectPermission,ticketPermission,linkedProjects,linkedTickets]=await Promise.all([
    d.inquiries.length ? hasEffectivePermission(req.user?.id,'INQUIRIES.VIEW') : false,
    d.projects.length ? hasEffectivePermission(req.user?.id,'PROJECTS.VIEW') : false,
    d.tickets.length ? hasEffectivePermission(req.user?.id,'TICKETS.VIEW') : false,
    d.projects.length ? prisma.project.findMany({where:{id:{in:d.projects.map((row)=>row.projectId)}},include:projectInclude}) : [],
    d.tickets.length ? prisma.ticket.findMany({where:{id:{in:d.tickets.map((row)=>row.ticketId)}},include:{assignments:true}}) : [],
  ]);
  const canViewInquiry = d.inquiries.length>0 && inquiryPermission;
  const canViewProject = projectPermission && linkedProjects.some((project)=>actorCanViewProject(actor,project));
  const canViewTicket = ticketPermission && linkedTickets.some((ticket)=>actorCanAccessTicket(actor,ticket));
  if(!canViewInquiry && !canViewProject && !canViewTicket) return res.status(404).json({error:'Document not found'});
  if(!fs.existsSync(d.storagePath)) return res.status(404).json({error:'Stored file not found'});

  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.download(d.storagePath,d.originalFileName);
}));

const uniqueAuditIds = (rows, modules) => [...new Set(rows.filter((row) => modules.includes(row.module) && row.recordId).map((row) => row.recordId))];

const auditObjectKeys = (value, output = new Set()) => {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((item) => auditObjectKeys(item, output));
    return output;
  }
  Object.entries(value).forEach(([key, item]) => {
    output.add(key);
    auditObjectKeys(item, output);
  });
  return output;
};

async function enrichAuditRecordLabels(rows) {
  const labels = new Map();
  const setLabel = (module, id, label) => {
    if (id && label) labels.set(`${module}:${id}`, label);
  };

  const inquiryIds = uniqueAuditIds(rows, ['INQUIRIES']);
  const projectIds = uniqueAuditIds(rows, ['PROJECTS']);
  const customerIds = uniqueAuditIds(rows, ['CUSTOMERS']);
  const userIds = uniqueAuditIds(rows, ['USERS', 'USER_ACCESS', 'AUTH']);
  const departmentIds = uniqueAuditIds(rows, ['DEPARTMENTS']);
  const panelIds = uniqueAuditIds(rows, ['PANELS']);
  const planningVersionIds = uniqueAuditIds(rows, ['PLANNING_GRID_MASTER']);
  const formVersionIds = uniqueAuditIds(rows.filter((row)=>String(row.action).startsWith('VERSION_')), ['INQUIRY_MASTER','PROJECT_MASTER','PANEL_MASTER','TICKET_MASTER']);
  const timesheetIds = uniqueAuditIds(rows, ['TIMESHEET']);
  const meetingIds = uniqueAuditIds(rows, ['MEETINGS']);
  const documentIds = uniqueAuditIds(rows, ['DOCUMENTS']);
  const documentTypeIds = uniqueAuditIds(rows, ['DOCUMENT_TYPES']);
  const inquiryStatusIds = uniqueAuditIds(rows, ['INQUIRY_MASTER']);
  const ticketIds = uniqueAuditIds(rows, ['TICKETS']);
  const ticketWorkflowIds = uniqueAuditIds(rows, ['TICKET_WORKFLOW']);
  const auditKeys = [...rows.reduce((keys, row) => {
    auditObjectKeys(row.oldValues, keys);
    auditObjectKeys(row.newValues, keys);
    return keys;
  }, new Set())];
  const dynamicFieldIds = auditKeys.filter((key) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key));

  const [inquiries, projects, customers, users, departments, panels, planningVersions, timesheets, meetings, documents, documentTypes, inquiryStatuses, formVersions, tickets, ticketWorkflows, auditFields] = await Promise.all([
    inquiryIds.length ? prisma.inquiry.findMany({ where:{ id:{ in:inquiryIds } }, select:{ id:true, inquiryNo:true, projectName:true } }) : [],
    projectIds.length ? prisma.project.findMany({ where:{ id:{ in:projectIds } }, select:{ id:true, projectNo:true, projectName:true } }) : [],
    customerIds.length ? prisma.customer.findMany({ where:{ id:{ in:customerIds } }, select:{ id:true, customerNo:true, customerName:true } }) : [],
    userIds.length ? prisma.user.findMany({ where:{ id:{ in:userIds } }, select:{ id:true, employeeNo:true, fullName:true } }) : [],
    departmentIds.length ? prisma.department.findMany({ where:{ id:{ in:departmentIds } }, select:{ id:true, departmentCode:true, departmentName:true } }) : [],
    panelIds.length ? prisma.panelMaster.findMany({ where:{ id:{ in:panelIds } }, select:{ id:true, panelCode:true, panelType:true } }) : [],
    planningVersionIds.length ? prisma.planningGridVersion.findMany({ where:{ id:{ in:planningVersionIds } }, select:{ id:true, versionNo:true, formName:true } }) : [],
    timesheetIds.length ? prisma.timesheetTask.findMany({ where:{ id:{ in:timesheetIds } }, select:{ id:true, title:true } }) : [],
    meetingIds.length ? prisma.meeting.findMany({ where:{ id:{ in:meetingIds } }, select:{ id:true, title:true } }) : [],
    documentIds.length ? prisma.document.findMany({ where:{ id:{ in:documentIds } }, select:{ id:true, originalFileName:true } }) : [],
    documentTypeIds.length ? prisma.documentType.findMany({ where:{ id:{ in:documentTypeIds } }, select:{ id:true, documentTypeCode:true, documentTypeName:true } }) : [],
    inquiryStatusIds.length ? prisma.inquiryStatusMaster.findMany({ where:{ id:{ in:inquiryStatusIds } }, select:{ id:true, statusName:true } }) : [],
    formVersionIds.length ? prisma.formVersion.findMany({where:{id:{in:formVersionIds}},include:{formMaster:{include:{panelMaster:true}}}}) : [],
    ticketIds.length ? prisma.ticket.findMany({where:{id:{in:ticketIds}},select:{id:true,ticketNo:true,subject:true}}) : [],
    ticketWorkflowIds.length ? prisma.ticketWorkflowStatus.findMany({where:{id:{in:ticketWorkflowIds}},select:{id:true,statusName:true}}) : [],
    dynamicFieldIds.length ? prisma.formField.findMany({where:{id:{in:dynamicFieldIds}},select:{id:true,fieldLabel:true,configJson:true}}) : [],
  ]);

  const auditFieldLabels = {};
  auditFields.forEach((field) => {
    auditFieldLabels[field.id] = field.fieldLabel;
    (field.configJson?.table_config?.columns || []).forEach((column) => {
      if (column?.id && column?.name) auditFieldLabels[column.id] = column.name;
    });
  });

  inquiries.forEach((row) => setLabel('INQUIRIES', row.id, `${row.inquiryNo}${row.projectName ? ` · ${row.projectName}` : ''}`));
  projects.forEach((row) => setLabel('PROJECTS', row.id, `${row.projectNo}${row.projectName ? ` · ${row.projectName}` : ''}`));
  customers.forEach((row) => setLabel('CUSTOMERS', row.id, `${row.customerNo}${row.customerName ? ` · ${row.customerName}` : ''}`));
  users.forEach((row) => {
    const label = `${row.employeeNo}${row.fullName ? ` · ${row.fullName}` : ''}`;
    setLabel('USERS', row.id, label);
    setLabel('USER_ACCESS', row.id, label);
    setLabel('AUTH', row.id, label);
  });
  departments.forEach((row) => setLabel('DEPARTMENTS', row.id, `${row.departmentCode}${row.departmentName ? ` · ${row.departmentName}` : ''}`));
  panels.forEach((row) => setLabel('PANELS', row.id, `${row.panelCode}${row.panelType ? ` · ${row.panelType}` : ''}`));
  planningVersions.forEach((row) => setLabel('PLANNING_GRID_MASTER', row.id, `${row.formName || 'Planning Grid'} · Version ${row.versionNo}`));
  timesheets.forEach((row) => setLabel('TIMESHEET', row.id, row.title));
  meetings.forEach((row) => setLabel('MEETINGS', row.id, row.title));
  documents.forEach((row) => setLabel('DOCUMENTS', row.id, row.originalFileName));
  documentTypes.forEach((row) => setLabel('DOCUMENT_TYPES', row.id, `${row.documentTypeCode}${row.documentTypeName ? ` · ${row.documentTypeName}` : ''}`));
  inquiryStatuses.forEach((row) => setLabel('INQUIRY_MASTER', row.id, `Status · ${row.statusName}`));
  formVersions.forEach((row)=>setLabel(`${row.formMaster.formType}_MASTER`,row.id,`${row.formMaster.panelMaster?.panelType || row.formMaster.formName} · v${row.versionNo}`));
  tickets.forEach((row)=>setLabel('TICKETS',row.id,`${row.ticketNo} · ${row.subject}`));
  ticketWorkflows.forEach((row)=>setLabel('TICKET_WORKFLOW',row.id,`Status · ${row.statusName}`));

  return rows.map((row) => ({
    ...row,
    recordLabel: labels.get(`${row.module}:${row.recordId}`) || '',
    fieldLabels:auditFieldLabels,
  }));
}

app.get('/api/audit-logs', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'AUDIT_LOGS.VIEW'))) return;
  const limit=Math.floor(Math.min(Math.max(Number(req.query.limit)||200,1),500));
  const offset=Math.floor(Math.max(Number(req.query.offset)||0,0));
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const from=String(req.query.from||''); const to=String(req.query.to||'');
  if((from&&(!datePattern.test(from)||Number.isNaN(Date.parse(`${from}T00:00:00+05:30`))))
    ||(to&&(!datePattern.test(to)||Number.isNaN(Date.parse(`${to}T00:00:00+05:30`)))))return res.status(400).json({error:'Invalid date filter.'});
  const where={};
  if(req.query.user_id)where.userId=String(req.query.user_id);
  if(req.query.action)where.action=String(req.query.action);
  if(req.query.module)where.module=String(req.query.module);
  if(req.query.department)where.user={userDepartments:{some:{department:{departmentName:String(req.query.department)}}}};
  if(from||to)where.createdAt={...(from?{gte:new Date(`${from}T00:00:00+05:30`)}:{}),...(to?{lt:new Date(new Date(`${to}T00:00:00+05:30`).getTime()+86400000)}:{})};
  const rows=await prisma.auditLog.findMany({where,include:{user:{include:{userDepartments:{include:{department:true}}}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit,skip:offset});
  const enriched=await enrichAuditRecordLabels(rows);
  res.json(enriched.map(serializeAudit));
}));

app.get('/api/audit-logs/options', asyncRoute(async (req,res)=>{
  if(!(await requireEffectivePermission(req,res,'AUDIT_LOGS.VIEW'))) return;
  const [events,users,departments]=await Promise.all([
    prisma.auditLog.findMany({distinct:['module','action'],select:{module:true,action:true}}),
    prisma.user.findMany({where:{auditLogs:{some:{}}},select:{id:true,fullName:true},orderBy:{fullName:'asc'}}),
    prisma.department.findMany({select:{departmentName:true},orderBy:{departmentName:'asc'}}),
  ]);
  res.json({events,users:users.map((u)=>({id:u.id,name:u.fullName})),departments:departments.map((d)=>d.departmentName)});
}));

app.use((err,req,res,_next)=>{console.error(err); if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_UNEXPECTED_FILE'?'This file field is not allowed for this request.':err.message}); if(err.statusCode)return res.status(err.statusCode).json({error:err.message}); if(err.code==='P2002')return res.status(409).json({error:'Duplicate value',details:err.meta}); if(err.code==='P2025')return res.status(404).json({error:'Record not found'}); res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});
app.listen(port, '0.0.0.0', ()=>console.log(`Nexus API running on http://0.0.0.0:${port}`));
const ticketSlaTimer=setInterval(()=>processTicketSla().catch((error)=>console.error('Ticket SLA check failed:',error.message)),15*60*1000);
ticketSlaTimer.unref?.();

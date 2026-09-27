import React from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { SecondaryButton } from './ui';

const ACTION_LABELS = {
  VIEW: 'View',
  CREATE: 'Create',
  UPDATE: 'Edit',
  STATUS_CHANGE: 'Status Change',
  DELETE: 'Delete',
  FOLLOW_UP: 'Follow-up / Reminder',
  COMMERCIAL_SUBMIT: 'Commercial Submit',
  KICKOFF: 'Kickoff Meeting',
  CONVERT_TO_PROJECT: 'Convert to Project',
  PLANNING_GRID: 'Project Planning Grid',
  DUPLICATE_PLANNING_GRID: 'Add Duplicate Planning Grid',
  UPDATE_COMPLETION: 'Update Task Status / Completion',
  MARK_COMPLETED: 'Mark Completed',
  UPLOAD_DOCUMENTS: 'Upload Documents',
  TEAM_VIEW: 'View Team',
  ASSIGN: 'Assign',
  APPROVE: 'Approve',
  SEND: 'Send',
  MANAGE_ACCESS: 'Manage Permissions',
  RESET_PASSWORD: 'Change User Password',
};

const PAGE_HELP = {
  DASHBOARD: 'Control whether this person can view the Dashboard.',
  CUSTOMERS: 'Control what this person can do on the Customers page.',
  INQUIRIES: 'Set this person’s inquiry access independently from other users with the same role.',
  PROJECTS: 'Control project viewing, creation, editing, planning and completion actions.',
  TICKETS: 'Control ticket creation, assignment, editing and workflow status changes.',
  TICKET_MASTER: 'Control versioned Ticket forms and fixed-field dropdown choices.',
  TICKET_WORKFLOW: 'Control dynamic Ticket workflow and SLA configuration.',
  NOTIFICATIONS: 'Control notification viewing and sending actions.',
  TIMESHEET: 'Control timesheet entry, viewing and team actions.',
  TIMESHEET_MASTER: 'Control department/team timesheet task management.',
  DOCUMENTS: 'Control document viewing, upload, update and download actions.',
  INQUIRY_MASTER: 'Control access to Inquiry Master configuration.',
  PANEL_MASTER: 'Control access to Panel Master configuration.',
  PROJECT_MASTER: 'Control access to Project Master configuration.',
  PLANNING_GRID_MASTER: 'Control access to planning-grid master setup.',
  DEPARTMENTS: 'Control Department Master access.',
  DOCUMENT_TYPES: 'Control Document Type Master access.',
  USERS: 'Control User Management access.',
  ROLE_PERMISSIONS: 'Controls whether this person can manage user access settings.',
  AUDIT_LOGS: 'Controls whether this person can view audit history.',
};

const actionKey = (action) => (typeof action === 'string' ? action : action.key);
const actionLabel = (action) => (
  typeof action === 'string'
    ? (ACTION_LABELS[action] || action)
    : (action.label || ACTION_LABELS[action.key] || action.key)
);

const normalize = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ');

const ownerMatches = (owner, roleCode, departments = []) => {
  const ownerText = String(owner || 'All').trim();
  if (!ownerText || /^all$/i.test(ownerText)) return true;
  if (/^admin$/i.test(ownerText)) return String(roleCode || '').toUpperCase() === 'ADMIN';

  const deptSet = new Set((departments || []).map(normalize));
  return ownerText
    .split('/')
    .map(normalize)
    .filter(Boolean)
    .some((candidate) => deptSet.has(candidate));
};

const hasDepartment = (departments, allowed) => {
  if (!allowed?.length) return true;
  const current = new Set((departments || []).map(normalize));
  return allowed.some((department) => current.has(normalize(department)));
};

const rule = (roles = [], departments = []) => ({ roles, departments });

// Reviewed from the user's Final Roles sheet.
// These are defaults for "Apply Suggested Access" only. Project-department,
// assigned-ticket and assigned-task scope is enforced by the related API logic.
const SUGGESTION_RULES = {
  'DASHBOARD.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'])],

  'INQUIRIES.CREATE': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'INQUIRIES.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES', 'ESTIMATION'])],
  'INQUIRIES.UPDATE': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'INQUIRIES.FOLLOW_UP': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'INQUIRIES.COMMERCIAL_SUBMIT': [],
  'INQUIRIES.STATUS_CHANGE': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES', 'ESTIMATION'])],
  'INQUIRIES.KICKOFF': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'INQUIRIES.CONVERT_TO_PROJECT': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],

  'PROJECTS.CREATE': [],
  'PROJECTS.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'PROJECTS.UPDATE': [rule(['HOD', 'TL'])],
  'PROJECTS.PLANNING_GRID': [rule(['HOD', 'TL'])],
  'PROJECTS.DUPLICATE_PLANNING_GRID': [rule(['HOD', 'TL'])],
  // HOD/TL update their department rows; employees can update only rows
  // assigned to them. The project-task API enforces that record scope.
  'PROJECTS.UPDATE_COMPLETION': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'PROJECTS.MARK_COMPLETED': [rule(['HOD', 'TL'])],
  'PROJECTS.UPLOAD_DOCUMENTS': [rule(['HOD', 'TL', 'EMPLOYEE'], ['ESTIMATION'])],

  'TICKETS.CREATE': [rule(['HOD','TL','EMPLOYEE'], ['STORE', 'AUTOMATION'])],
  'TICKETS.VIEW': [rule(['HOD','TL','EMPLOYEE'])],
  'TICKETS.UPDATE': [rule(['HOD','TL','EMPLOYEE'], ['STORE', 'AUTOMATION'])],
  'TICKETS.ASSIGN': [rule(['HOD','TL'])],
  'TICKETS.STATUS_CHANGE': [rule(['HOD','TL','EMPLOYEE'])],
  'TICKET_MASTER.VIEW': [],
  'TICKET_MASTER.CREATE': [],
  'TICKET_MASTER.UPDATE': [],
  'TICKET_WORKFLOW.VIEW': [],
  'TICKET_WORKFLOW.CREATE': [],
  'TICKET_WORKFLOW.UPDATE': [],

  'CUSTOMERS.CREATE': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'CUSTOMERS.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],
  'CUSTOMERS.UPDATE': [rule(['HOD', 'TL', 'EMPLOYEE'], ['SALES'])],

  'NOTIFICATIONS.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'NOTIFICATIONS.SEND': [],

  'TIMESHEET.CREATE': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'TIMESHEET.VIEW': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'TIMESHEET.UPDATE': [rule(['HOD', 'TL', 'EMPLOYEE'])],
  'TIMESHEET.TEAM_VIEW': [rule(['HOD', 'TL'])],
  'TIMESHEET.ASSIGN': [rule(['HOD', 'TL'])],
  'TIMESHEET.APPROVE': [],

  'TIMESHEET_MASTER.VIEW': [],
  'TIMESHEET_MASTER.CREATE': [],
  'TIMESHEET_MASTER.UPDATE': [],
  'TIMESHEET_MASTER.ASSIGN': [],
  'TIMESHEET_MASTER.DELETE': [],

  'INQUIRY_MASTER.VIEW': [],
  'INQUIRY_MASTER.CREATE': [],
  'INQUIRY_MASTER.UPDATE': [],
  'PANEL_MASTER.VIEW': [],
  'PANEL_MASTER.CREATE': [],
  'PANEL_MASTER.UPDATE': [],
  'PROJECT_MASTER.VIEW': [],
  'PROJECT_MASTER.CREATE': [],
  'PROJECT_MASTER.UPDATE': [],
  'PLANNING_GRID_MASTER.VIEW': [],
  'PLANNING_GRID_MASTER.CREATE': [],
  'PLANNING_GRID_MASTER.UPDATE': [],
  'PLANNING_GRID_MASTER.DELETE': [],
  'DEPARTMENTS.VIEW': [],
  'DEPARTMENTS.CREATE': [],
  'DEPARTMENTS.UPDATE': [],
  'DOCUMENT_TYPES.VIEW': [],
  'DOCUMENT_TYPES.CREATE': [],
  'DOCUMENT_TYPES.UPDATE': [],
  'USERS.VIEW': [],
  'USERS.CREATE': [],
  'USERS.UPDATE': [],
  'USERS.MANAGE_ACCESS': [],
  'USERS.RESET_PASSWORD': [],
  'AUDIT_LOGS.VIEW': [],
};

const matchesRule = (candidate, roleCode, departments) => {
  const role = String(roleCode || '').toUpperCase();
  const roleMatches = !candidate.roles?.length || candidate.roles.includes(role);
  return roleMatches && hasDepartment(departments, candidate.departments || []);
};

export const buildSuggestedPermissionKeys = (pages = [], roleCode = '', departments = []) => {
  const role = String(roleCode || '').toUpperCase();
  if (role === 'ADMIN') {
    return pages.flatMap((page) =>
      (page.actions || []).map((action) => `${page.module}.${actionKey(action)}`)
    );
  }

  return pages.flatMap((page) => (page.actions || []).flatMap((action) => {
    const key = `${page.module}.${actionKey(action)}`;
    if (Object.prototype.hasOwnProperty.call(SUGGESTION_RULES, key)) {
      const rules = SUGGESTION_RULES[key];
      return rules.some((candidate) => matchesRule(candidate, role, departments)) ? [key] : [];
    }
    return ownerMatches(page.suggested_owner_department, role, departments) ? [key] : [];
  }));
};

const SelectionButtons = ({ selectedCount, total, onSelectAll, onDeselectAll, disabled, compact = false }) => {
  if (!total) return null;
  const noneSelected = selectedCount === 0;
  const allSelected = selectedCount === total;

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {!allSelected && (
        <button
          type="button"
          onClick={onSelectAll}
          disabled={disabled}
          className={`${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} rounded-md border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Select All
        </button>
      )}
      {!noneSelected && (
        <button
          type="button"
          onClick={onDeselectAll}
          disabled={disabled}
          className={`${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} rounded-md border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Deselect All
        </button>
      )}
    </div>
  );
};

export default function UserAccessEditor({
  pages = [],
  permissionKeys = [],
  onToggle,
  onUseRoleDefaults,
  isAdmin = false,
  loading = false,
}) {
  const allKeys = pages.flatMap((page) =>
    (page.actions || []).map((action) => `${page.module}.${actionKey(action)}`)
  );
  const selectedSet = new Set(permissionKeys);
  const total = allKeys.length;
  const selectedCount = isAdmin ? total : allKeys.filter((key) => selectedSet.has(key)).length;
  const disabled = loading || isAdmin;

  const setSelection = (keys, selected) => {
    if (disabled) return;
    const current = new Set(permissionKeys);
    keys.forEach((key) => {
      const isSelected = current.has(key);
      if ((selected && !isSelected) || (!selected && isSelected)) onToggle(key);
    });
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <ShieldCheck size={17} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Person-specific Page & API Access</h3>
            <p className="text-xs text-slate-500">
              Every checked action is also enforced on the related backend API. Suggested access now follows the reviewed role rules.
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-400">Selected {selectedCount} of {total}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin && (
            <SelectionButtons
              selectedCount={selectedCount}
              total={total}
              onSelectAll={() => setSelection(allKeys, true)}
              onDeselectAll={() => setSelection(allKeys, false)}
              disabled={loading}
            />
          )}
          <SecondaryButton type="button" onClick={onUseRoleDefaults} disabled={loading || isAdmin}>
            <RotateCcw size={14} /> Apply Suggested Access
          </SecondaryButton>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Admin receives all {total} available permissions. Choose another role to restrict this user.
        </div>
      )}

      <div className="space-y-3">
        {pages.map((page) => {
          const pageKeys = (page.actions || []).map((action) => `${page.module}.${actionKey(action)}`);
          const pageSelectedCount = isAdmin ? pageKeys.length : pageKeys.filter((key) => selectedSet.has(key)).length;

          return (
            <div key={page.module} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{page.label} Access</p>
                  <p className="text-[11px] text-slate-500">
                    {PAGE_HELP[page.module] || `Control access to ${page.label}.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isAdmin && (
                    <SelectionButtons
                      compact
                      selectedCount={pageSelectedCount}
                      total={pageKeys.length}
                      onSelectAll={() => setSelection(pageKeys, true)}
                      onDeselectAll={() => setSelection(pageKeys, false)}
                      disabled={loading}
                    />
                  )}
                  {page.suggested_owner_department && (
                    <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">
                      Base owner: {page.suggested_owner_department}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {(page.actions || []).map((action) => {
                  const name = actionKey(action);
                  const key = `${page.module}.${name}`;
                  const checked = isAdmin || permissionKeys.includes(key);

                  return (
                    <label
                      key={key}
                      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        checked
                          ? 'border-blue-200 bg-blue-50/70 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      } ${isAdmin ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-blue-300'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={loading || isAdmin}
                        onChange={() => onToggle(key)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{actionLabel(action)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

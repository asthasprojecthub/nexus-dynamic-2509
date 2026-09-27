import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart2,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Kanban,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  RotateCcw,
  Timer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { AlertDialog, ConfirmDialog } from '../components/ui';

const STATUSES = ['Backlog', 'Planned', 'In Progress', 'Review', 'Completed'];
const TYPES = ['Development', 'Design', 'Meeting', 'Review', 'Testing', 'Documentation', 'Support', 'Other'];

const STATUS_STYLE = {
  Backlog: 'bg-slate-100 text-slate-600 border-slate-200',
  Planned: 'bg-blue-100 text-blue-700 border-blue-200',
  'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
  Review: 'bg-purple-100 text-purple-700 border-purple-200',
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const STATUS_BORDER = {
  Backlog: 'border-slate-200',
  Planned: 'border-blue-200',
  'In Progress': 'border-amber-200',
  Review: 'border-purple-200',
  Completed: 'border-emerald-200',
};

const STATUS_DOT = {
  Backlog: 'bg-slate-400',
  Planned: 'bg-blue-500',
  'In Progress': 'bg-amber-500',
  Review: 'bg-purple-500',
  Completed: 'bg-emerald-500',
};

const STATUS_CELL = {
  Backlog: 'bg-slate-50/70',
  Planned: 'bg-blue-50/60',
  'In Progress': 'bg-amber-50/60',
  Review: 'bg-purple-50/60',
  Completed: 'bg-emerald-50/60',
};

const TYPE_STYLE = {
  Development: 'bg-sky-50 text-sky-700',
  Design: 'bg-pink-50 text-pink-700',
  Meeting: 'bg-orange-50 text-orange-700',
  Review: 'bg-purple-50 text-purple-700',
  Testing: 'bg-yellow-50 text-yellow-700',
  Documentation: 'bg-teal-50 text-teal-700',
  Support: 'bg-red-50 text-red-700',
  Other: 'bg-slate-50 text-slate-600',
};

const TYPE_DOT = {
  Development: 'bg-sky-500',
  Design: 'bg-pink-500',
  Meeting: 'bg-orange-500',
  Review: 'bg-purple-500',
  Testing: 'bg-yellow-500',
  Documentation: 'bg-teal-500',
  Support: 'bg-red-500',
  Other: 'bg-slate-400',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

const mondaySunday = () => {
  const now = new Date();
  const monday = new Date(now);
  const offset = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
};

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(`${dateOnly(value)}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtRange = (from, to) => {
  if (!from || !to) return 'Select date range';
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const aDay = String(a.getDate()).padStart(2, '0');
  const bDay = String(b.getDate()).padStart(2, '0');
  const month = b.toLocaleDateString('en-IN', { month: 'short' });
  const year = b.getFullYear();
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${aDay} – ${bDay} ${month} ${year}`;
  return `${fmtDate(from)} – ${fmtDate(to)}`;
};

const fmtHours = (value = 0) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0m';
  const hours = Math.floor(n);
  const mins = Math.round((n - hours) * 60);
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const timeToMinutes = (value) => {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null;
  const [h, m] = String(value).split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const defaultSlot = () => {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = Math.floor(mins / 30) * 30;
  return { start: minutesToTime(start), end: minutesToTime(start + 30) };
};

const formatTime12 = (value) => {
  const mins = timeToMinutes(value);
  if (mins == null) return value || '';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

const hoursBetween = (start, end) => {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null || e <= s) return null;
  return (e - s) / 60;
};

const parseDuration = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return { valid: false, decimal: null };
  if (value.includes(':')) {
    const [hRaw, mRaw] = value.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return { valid: false, decimal: null };
    return { valid: h * 60 + m > 0, decimal: h + m / 60 };
  }
  if (value.includes('.')) {
    const [hRaw, mRaw = '0'] = value.split('.');
    const h = Number(hRaw || 0);
    const m = Number((mRaw || '0').padEnd(2, '0').slice(0, 2));
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return { valid: false, decimal: null };
    return { valid: h * 60 + m > 0, decimal: h + m / 60 };
  }
  const h = Number(value);
  if (!Number.isFinite(h) || h <= 0) return { valid: false, decimal: null };
  return { valid: true, decimal: h };
};

const emptyTask = () => ({
  title: '',
  remarks: '',
  project_id: '',
  task_type: 'Development',
  department_id: '',
  assigned_user_id: '',
  start_date: todayISO(),
  status: 'Backlog',
  start_time: '',
  end_time: '',
  hours_input: '',
});

const userCanTeam = (user) =>
  Boolean(
    user?.permissions?.includes('TIMESHEET.TEAM_VIEW') ||
      ['ADMIN', 'HOD', 'TL'].includes(String(user?.role_code || '').toUpperCase())
  );

const userCanAssign = (user, master) =>
  Boolean(
    master ||
      user?.permissions?.includes('TIMESHEET.ASSIGN') ||
      ['ADMIN', 'HOD', 'TL'].includes(String(user?.role_code || '').toUpperCase())
  );

const taskEmployeeName = (task) => task.assigned_to || 'Unassigned';

function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    gray: 'bg-slate-100 text-slate-500',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    teal: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="flex min-h-[86px] items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneMap[tone] || toneMap.blue}`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-xl font-semibold leading-none text-slate-900">{value}</p>
        {sub ? <p className="mt-1 truncate text-[11px] text-slate-400">{sub}</p> : null}
      </div>
    </div>
  );
}

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
        className="h-9 w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
        aria-label="From date"
      />
      <span className="text-slate-300">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
        className="h-9 w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
        aria-label="To date"
      />
    </div>
  );
}

function TaskModal({ task, master, onClose, onSaved }) {
  const { data } = useStore();
  const current = data.currentUser;
  const canAssign = userCanAssign(current, master);
  const projectLinked = task?.task_source === 'PROJECT';
  const restrictedProjectTask = Boolean(projectLinked && !canAssign);
  const slot = useMemo(defaultSlot, []);
  const [form, setForm] = useState(() => {
    if (!task) return { ...emptyTask(), assigned_user_id: current?.id || '' };
    return {
      title: task.title || '',
      remarks: task.remarks || task.description || '',
      project_id: task.project_id || '',
      task_type: task.task_type || 'Other',
      department_id: task.department_id || '',
      assigned_user_id: task.assigned_user_id || current?.id || '',
      start_date: dateOnly(task.start_date) || todayISO(),
      status: task.status || 'Backlog',
      start_time: task.start_time || '',
      end_time: task.end_time || '',
      hours_input: task.actual_hours ? String(task.actual_hours) : '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const departments = (data.departments || []).filter((d) => d.is_active !== false);
  const users = (data.users || []).filter((u) => u.is_active !== false);
  const projects = data.projects || [];
  const set = (key, value) => setForm((v) => ({ ...v, [key]: value }));

  const assignableUsers = useMemo(() => {
    if (!form.department_id) return users;
    const dept = departments.find((d) => d.id === form.department_id)?.department_name;
    if (!dept) return users;
    return users.filter((u) => (u.departments || []).includes(dept));
  }, [users, departments, form.department_id]);

  const calculatedHours = hoursBetween(form.start_time, form.end_time);
  const parsedHours = parseDuration(form.hours_input);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!String(form.title || '').trim() && !restrictedProjectTask) return setError('Task Title is required.');
    if (!form.start_date && !restrictedProjectTask) return setError('Date is required.');
    if (!form.status) return setError('Status is required.');
    if ((form.start_time || form.end_time) && calculatedHours == null) return setError('End Time must be after Start Time.');
    if (form.hours_input && !parsedHours.valid && calculatedHours == null) return setError('Hours must use H.MM or H:MM, for example 1.15 or 1:30.');

    let startTime = form.start_time;
    let endTime = form.end_time;
    let actualHours = calculatedHours;
    if (!startTime && !endTime && !form.hours_input && !task) {
      startTime = slot.start;
      endTime = slot.end;
      actualHours = hoursBetween(slot.start, slot.end) || 0.5;
    } else if (actualHours == null && parsedHours.valid) {
      actualHours = parsedHours.decimal;
      if (startTime && !endTime) endTime = minutesToTime(timeToMinutes(startTime) + Math.round(actualHours * 60));
    }
    actualHours = Number(actualHours || 0);

    setSaving(true);
    try {
      let payload;
      if (restrictedProjectTask) {
        payload = {
          status: form.status,
          actual_hours: actualHours,
          start_time: startTime || '',
          end_time: endTime || '',
          remarks: String(form.remarks || '').trim(),
        };
      } else {
        payload = {
          master,
          title: String(form.title || '').trim(),
          remarks: String(form.remarks || '').trim(),
          description: String(form.remarks || '').trim(),
          project_id: form.project_id || null,
          task_type: form.task_type || 'Other',
          department_id: form.department_id || null,
          assigned_user_id: form.assigned_user_id || current?.id,
          start_date: form.start_date,
          status: form.status,
          start_time: startTime || '',
          end_time: endTime || '',
          actual_hours: actualHours,
        };
      }
      if (task) await api(`/timesheet/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/timesheet/tasks', { method: 'POST', body: JSON.stringify(payload) });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{task ? 'Edit Task' : 'Log New Task'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[calc(94vh-68px)] overflow-y-auto px-6 py-5">
          {projectLinked ? (
            <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Project-linked task. Project structure stays controlled from Project Planning Grid.
            </div>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Task Title <span className="text-rose-500">*</span>
            <input
              value={form.title}
              disabled={restrictedProjectTask}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Design MCC panel layout"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Project Planning Remark
            <textarea
              rows={3}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder="Optional details about this task..."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Project
              <select value={form.project_id} disabled={restrictedProjectTask} onChange={(e) => set('project_id', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100">
                <option value="">— No Project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_no} · {p.project_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Task Type <span className="text-rose-500">*</span>
              <select value={form.task_type} disabled={restrictedProjectTask} onChange={(e) => set('task_type', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100">
                {TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Team
            <select value={form.department_id} disabled={restrictedProjectTask || !canAssign} onChange={(e) => set('department_id', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100">
              <option value="">Select Team</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
            </select>
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-1"><Users size={14} /> Assign To</span>
            <select value={form.assigned_user_id} disabled={restrictedProjectTask || !canAssign} onChange={(e) => set('assigned_user_id', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100">
              {!canAssign ? <option value={current?.id || ''}>— Assign to self —</option> : <option value="">— Assign to self —</option>}
              {assignableUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}{u.id === current?.id ? ' (You)' : ''}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-400">Leave blank to assign to yourself.</span>
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Date <span className="text-rose-500">*</span>
              <input type="date" value={form.start_date} disabled={restrictedProjectTask} onChange={(e) => set('start_date', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status <span className="text-rose-500">*</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Time Tracking</p>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                Start Time
                <input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                End Time
                <input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Hours
                <input value={form.hours_input} onChange={(e) => set('hours_input', e.target.value)} placeholder="e.g. 1.15 or 1:30" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Hours use H.MM or H:MM. Leave all three blank to use the current default slot {formatTime12(slot.start)}–{formatTime12(slot.end)}.
            </p>
          </div>

          {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const initials = (name = '') => {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
};

const taskTypeClass = (task) => TYPE_STYLE[task.task_type] || TYPE_STYLE.Other;
const taskStatusBorder = (task) => STATUS_BORDER[task.status] || STATUS_BORDER.Backlog;

function TaskCard({ task, onEdit, onDragStart }) {
  return (
    <div
      draggable={!task.is_archived}
      onDragStart={(e) => onDragStart?.(e, task)}
      onClick={() => onEdit(task)}
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${taskStatusBorder(task)} ${task.is_archived ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${task.task_source === 'PROJECT' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
            {task.task_source || 'USER'}
          </span>
          {task.task_source === 'PROJECT' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SYNCED</span> : null}
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${taskTypeClass(task)}`}>{task.task_type || 'Other'}</span>
          {task.is_archived ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Archived</span> : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-500"><Clock size={11} /> {fmtHours(task.actual_hours)}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">{task.title}</p>
      {task.remarks ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.remarks}</p> : null}

      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5"><Users size={11} className="text-slate-400" /><span className="truncate">{taskEmployeeName(task)}</span></div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[task.status] || STATUS_DOT.Backlog}`} />{fmtDate(task.start_date)}</span>
          {task.ticket_no || task.project_no ? <span className="max-w-[110px] truncate rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">{task.ticket_no || task.project_no}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ListView({ tasks, onEdit, onArchive, onRestore }) {
  if (!tasks.length) {
    return <div className="rounded-xl border border-slate-100 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">No tasks found for the selected filters.</div>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      {tasks.map((task) => (
        <article key={task.id} className={`rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md ${taskStatusBorder(task)} ${task.is_archived ? 'bg-slate-50 opacity-80' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <button type="button" onClick={() => onEdit(task)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${task.task_source === 'PROJECT' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{task.task_source || 'USER'}</span>
                {task.task_source === 'PROJECT' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SYNCED</span> : null}
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${taskTypeClass(task)}`}>{task.task_type || 'Other'}</span>
                {task.is_archived ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">ARCHIVED</span> : null}
              </div>
              <h4 className="mt-2 text-sm font-semibold text-slate-900">{task.title}</h4>
              {task.remarks ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.remarks}</p> : null}
            </button>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {Number(task.actual_hours || 0) > 0 ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Clock size={12} /> {fmtHours(task.actual_hours)}</span> : null}
              <div className="flex items-center gap-1.5">
                {!task.is_archived ? (
                  <>
                    <button type="button" onClick={() => onEdit(task)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" title="Edit"><Edit2 size={12} /> Edit</button>
                    <button type="button" onClick={() => onArchive(task)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" title="Archive"><Archive size={12} /> Archive</button>
                  </>
                ) : (
                  <button type="button" onClick={() => onRestore(task)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50" title="Unarchive"><RotateCcw size={12} /> Unarchive</button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 overflow-x-auto text-[11px] text-slate-400">
            <div className="flex shrink-0 items-center gap-4 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[task.status] || STATUS_DOT.Backlog}`} />{fmtDate(task.start_date)}</span>
              <span className="inline-flex items-center gap-1.5"><Users size={11} /> {taskEmployeeName(task)}</span>
              <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[task.status] || STATUS_STYLE.Backlog}`}>{task.status}</span>
            </div>
            {task.ticket_no || task.project_no ? <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">{task.ticket_no || task.project_no}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function KanbanView({ tasks, onEdit, onStatusDrop, members = [], currentUser = null, teamMode = false }) {
  const [dragged, setDragged] = useState(null);

  const derivedMembers = useMemo(() => {
    if (teamMode && members.length) {
      return members.map((member) => ({ id: String(member.id), name: member.full_name || member.name || 'User' }));
    }
    if (!teamMode && currentUser?.id) {
      return [{ id: String(currentUser.id), name: currentUser.full_name || currentUser.name || 'Me' }];
    }
    const map = new Map();
    tasks.forEach((task) => {
      const id = String(task.assigned_user_id || 'unassigned');
      if (!map.has(id)) map.set(id, { id, name: taskEmployeeName(task) });
    });
    return [...map.values()];
  }, [teamMode, members, currentUser, tasks]);

  const taskIdsInMembers = new Set(derivedMembers.map((m) => m.id));
  const extras = [];
  tasks.forEach((task) => {
    const id = String(task.assigned_user_id || 'unassigned');
    if (!taskIdsInMembers.has(id) && !extras.some((m) => m.id === id)) extras.push({ id, name: taskEmployeeName(task) });
  });
  const lanes = [...derivedMembers, ...extras];

  const handleDragStart = (e, task) => {
    setDragged(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-5 gap-3 border-b border-slate-200 px-3 py-2">
          {STATUSES.map((status) => (
            <div key={status} className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
              <span>{status}</span>
            </div>
          ))}
        </div>

        {lanes.length ? lanes.map((member) => {
          const memberTasks = tasks.filter((task) => String(task.assigned_user_id || 'unassigned') === member.id);
          return (
            <section key={member.id} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <span className="text-xs text-slate-400">⌄</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{initials(member.name)}</div>
                <span className="text-sm font-semibold text-slate-800">{member.name}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{memberTasks.length}</span>
              </div>

              <div className="grid grid-cols-5">
                {STATUSES.map((status) => {
                  const rows = memberTasks.filter((task) => task.status === status);
                  return (
                    <div
                      key={`${member.id}-${status}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragged && dragged.status !== status) onStatusDrop(dragged, status);
                        setDragged(null);
                      }}
                      className={`min-h-[128px] border-r border-slate-100 p-3 last:border-r-0 ${STATUS_CELL[status]}`}
                    >
                      <div className="space-y-2">
                        {rows.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onDragStart={handleDragStart} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }) : <div className="py-16 text-center text-sm text-slate-400">No team members or tasks found.</div>}
      </div>
    </div>
  );
}

const startOfWeekMonday = (date) => {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const isoLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function CalendarView({ tasks, onEdit }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState('month');
  const [selected, setSelected] = useState(null);

  const groupsByDay = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const day = dateOnly(task.start_date);
      if (!day) return;
      const employeeId = String(task.assigned_user_id || 'unassigned');
      const key = `${day}__${employeeId}`;
      if (!map.has(key)) map.set(key, { key, day, employeeId, employeeName: taskEmployeeName(task), tasks: [] });
      map.get(key).tasks.push(task);
    });
    return map;
  }, [tasks]);

  const groupsForDay = (day) => [...groupsByDay.values()].filter((group) => group.day === day).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const today = isoLocal(new Date());
  let days = [];
  let title = '';
  if (mode === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeekMonday(first);
    days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    title = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } else if (mode === 'week') {
    const start = startOfWeekMonday(cursor);
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const end = days[6];
    title = `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  } else {
    days = [new Date(cursor)];
    title = cursor.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  const goPrev = () => setCursor((current) => {
    const d = new Date(current);
    if (mode === 'month') d.setMonth(d.getMonth() - 1);
    else if (mode === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    return d;
  });
  const goNext = () => setCursor((current) => {
    const d = new Date(current);
    if (mode === 'month') d.setMonth(d.getMonth() + 1);
    else if (mode === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    return d;
  });

  const cols = mode === 'day' ? 'grid-cols-1' : 'grid-cols-7';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrev} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50">‹</button>
          <button type="button" onClick={() => setCursor(new Date())} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Today</button>
          <button type="button" onClick={goNext} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50">›</button>
          <h3 className="ml-1 min-w-[180px] text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {['month', 'week', 'day'].map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${mode === item ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{item}</button>)}
        </div>
      </div>

      {mode !== 'day' ? (
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <div key={name} className="border-r border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500 last:border-r-0">{name}</div>)}
        </div>
      ) : null}

      <div className={`grid ${cols}`}>
        {days.map((day, index) => {
          const ymd = isoLocal(day);
          const groups = groupsForDay(ymd);
          const outsideMonth = mode === 'month' && day.getMonth() !== cursor.getMonth();
          return (
            <div key={ymd} className={`relative border-b border-r border-slate-200 p-2 last:border-r-0 ${mode === 'month' ? 'min-h-[105px]' : mode === 'week' ? 'min-h-[320px]' : 'min-h-[420px]'} ${outsideMonth ? 'bg-slate-50/60 text-slate-300' : 'bg-white'}`}>
              <div className="flex justify-end">
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${ymd === today ? 'bg-blue-600 text-white' : outsideMonth ? 'text-slate-300' : 'text-slate-500'}`}>{day.getDate()}</span>
              </div>
              <div className="mt-1 space-y-1">
                {groups.slice(0, mode === 'month' ? 4 : 20).map((group) => {
                  const type = group.tasks[0]?.task_type || 'Other';
                  return <button key={group.key} type="button" onClick={() => setSelected(group)} className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left text-[10px] font-medium text-slate-700 hover:bg-slate-50"><span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[type] || TYPE_DOT.Other}`} /><span className="truncate">{group.employeeName}</span>{group.tasks.length > 1 ? <span className="ml-auto text-[9px] text-slate-400">{group.tasks.length}</span> : null}</button>;
                })}
                {mode === 'month' && groups.length > 4 ? <p className="px-1.5 text-[10px] text-blue-600">+{groups.length - 4} more</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {TYPES.map((type) => <div key={type} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TYPE_DOT[type] || TYPE_DOT.Other}`} /><span className="text-[10px] text-slate-500">{type}</span></div>)}
        </div>
        <span className="text-[10px] text-slate-400">Calendar shows each person once per day. Click a name to open that person's tasks.</span>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/30 p-4" onMouseDown={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials(selected.employeeName)}</div>
                <div><p className="text-sm font-semibold text-slate-900">{selected.employeeName}</p><p className="text-[11px] text-slate-500">{fmtDate(selected.day)} · {selected.tasks.length} task{selected.tasks.length === 1 ? '' : 's'}</p></div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
              {selected.tasks.map((task) => <button key={task.id} type="button" onClick={() => { setSelected(null); onEdit(task); }} className={`w-full rounded-lg border bg-slate-50/60 p-3 text-left hover:bg-blue-50/40 ${taskStatusBorder(task)}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-900">{task.title}</p><span className="text-[10px] text-slate-500">{fmtHours(task.actual_hours)}</span></div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className={`rounded px-1.5 py-0.5 ${taskTypeClass(task)}`}>{task.task_type || 'Other'}</span><span>{task.status}</span>{task.project_no ? <span>{task.project_no}</span> : null}</div></button>)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChartEmpty({ text }) {
  return <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">{text}</div>;
}

const ANALYTICS_BAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

function EmployeeHoursChart({ rows }) {
  const data = rows.filter((row) => Number(row.hours || 0) > 0).slice(0, 10);
  if (!data.length) return <ChartEmpty text="No data for selected filters." />;

  const max = Math.max(...data.map((row) => Number(row.hours || 0)), 1);
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const ticks = [ceiling, ceiling * 0.75, ceiling * 0.5, ceiling * 0.25, 0];

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="grid h-[220px] grid-cols-[36px_1fr] gap-2">
        <div className="flex flex-col justify-between pb-7 text-right text-[10px] text-slate-400">
          {ticks.map((tick, index) => <span key={index}>{Math.round(tick * 10) / 10}h</span>)}
        </div>
        <div className="relative border-b border-slate-200">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between">
            {ticks.slice(0, 4).map((_, index) => <div key={index} className="border-t border-dashed border-slate-100" />)}
          </div>
          <div className="absolute inset-x-1 bottom-0 top-0 flex items-end justify-around gap-2 pb-7">
            {data.map((row, index) => {
              const height = Math.max(4, (Number(row.hours || 0) / ceiling) * 100);
              const shortName = String(row.label || 'Unknown').split(' ')[0];
              return (
                <div key={row.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${row.label}: ${fmtHours(row.hours)}`}>
                  <div
                    className="w-full max-w-[38px] rounded-t-[4px] transition-opacity hover:opacity-80"
                    style={{ height: `${height}%`, backgroundColor: ANALYTICS_BAR_COLORS[index % ANALYTICS_BAR_COLORS.length] }}
                  />
                  <span className="w-full truncate text-center text-[10px] text-slate-500">{shortName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectHoursChart({ rows }) {
  const data = rows.filter((row) => Number(row.hours || 0) > 0).slice(0, 10);
  if (!data.length) return <ChartEmpty text="No project data for selected filters." />;

  const max = Math.max(...data.map((row) => Number(row.hours || 0)), 1);
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const ticks = [0, ceiling * 0.25, ceiling * 0.5, ceiling * 0.75, ceiling];

  return (
    <div className="px-4 pb-4 pt-4">
      <div className="grid min-h-[220px] grid-cols-[82px_1fr] gap-2">
        <div className="space-y-2.5 pt-0.5">
          {data.map((row) => (
            <div key={row.key} className="h-4 truncate text-right text-[10px] text-slate-500" title={row.label}>{row.label}</div>
          ))}
        </div>
        <div className="relative pb-6">
          <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex justify-between">
            {ticks.map((_, index) => <div key={index} className="h-full border-l border-dashed border-slate-100" />)}
          </div>
          <div className="relative space-y-2.5">
            {data.map((row, index) => {
              const width = Math.max(2, (Number(row.hours || 0) / ceiling) * 100);
              return (
                <div key={row.key} className="h-4" title={`${row.label}: ${fmtHours(row.hours)}`}>
                  <div
                    className="h-3.5 rounded-r-[4px] transition-opacity hover:opacity-80"
                    style={{ width: `${width}%`, backgroundColor: ANALYTICS_BAR_COLORS[index % ANALYTICS_BAR_COLORS.length] }}
                  />
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-slate-400">
            {ticks.map((tick, index) => <span key={index}>{Math.round(tick * 10) / 10}h</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView({ tasks, departments, users, projects, from, to, onRestore }) {
  const activeUsers = new Set(tasks.filter((t) => Number(t.actual_hours || 0) > 0).map((t) => t.assigned_user_id));
  const completed = tasks.filter((t) => t.status === 'Completed').length;
  const pending = tasks.length - completed;
  const totalHours = tasks.reduce((sum, t) => sum + Number(t.actual_hours || 0), 0);

  const byEmployee = Object.values(tasks.reduce((map, task) => {
    const key = task.assigned_user_id || task.assigned_to || 'unknown';
    map[key] ||= { key, label: taskEmployeeName(task), hours: 0, total: 0, completed: 0 };
    map[key].hours += Number(task.actual_hours || 0);
    map[key].total += 1;
    if (task.status === 'Completed') map[key].completed += 1;
    return map;
  }, {})).sort((a, b) => b.hours - a.hours);

  const byProject = Object.values(tasks.reduce((map, task) => {
    const key = task.project_id || 'no-project';
    const label = task.project_name ? `${task.project_no || ''} ${task.project_name}`.trim() : 'No Project';
    map[key] ||= { key, label, hours: 0 };
    map[key].hours += Number(task.actual_hours || 0);
    return map;
  }, {})).sort((a, b) => b.hours - a.hours);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Company Timesheet Analytics</h3>
          <p className="text-sm text-slate-500">{departments.length} departments assigned · {users.length} users</p>
          <p className="text-xs text-slate-400">{activeUsers.size} employees with timesheet activity · {fmtRange(from, to)}</p>
        </div>
        <button type="button" className="self-start rounded-lg border border-slate-200 bg-white p-2 text-slate-500"><RefreshCw size={14} /></button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Clock} label="Total Hours" value={fmtHours(totalHours).replace('0m', '0h')} tone="blue" />
        <StatCard icon={CheckCircle2} label="Completed Tasks" value={completed} tone="green" />
        <StatCard icon={Circle} label="Pending Tasks" value={pending} tone="amber" />
        <StatCard icon={Users} label="Active Employees" value={activeUsers.size} sub="with logged hours" tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h4 className="font-semibold text-slate-900">Hours by Employee</h4><p className="text-xs text-slate-500">Top 10 by logged hours</p></div><EmployeeHoursChart rows={byEmployee} /></section>
        <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h4 className="font-semibold text-slate-900">Hours by Project</h4><p className="text-xs text-slate-500">Top 10 projects</p></div><ProjectHoursChart rows={byProject} /></section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h4 className="font-semibold text-slate-900">Timesheet Tasks</h4><p className="text-xs text-slate-500">{tasks.length} tasks in current filter</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left">Task</th>
                <th className="px-5 py-3 text-left">Employee</th>
                <th className="px-5 py-3 text-left">Source</th>
                <th className="px-5 py-3 text-left">Sync</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length ? tasks.slice(0, 100).map((t) => {
                const projectTask = t.task_source === 'PROJECT';
                return (
                  <tr key={t.id} className={`border-t border-slate-100 ${t.is_archived ? 'bg-slate-50 opacity-80' : 'hover:bg-slate-50/70'}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{t.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{t.ticket_no || t.project_no || 'No linked record'}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{taskEmployeeName(t)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${projectTask ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        {t.task_source || 'USER'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {projectTask ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SYNCED</span> : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[t.status] || STATUS_STYLE.Backlog}`}>{t.status}</span>
                        {t.is_archived ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700"><Archive size={10} /> Archived</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {t.is_archived ? (
                        <button type="button" onClick={() => onRestore?.(t)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50" title="Unarchive task"><RotateCcw size={12} /> Restore</button>
                      ) : <span className="text-xs text-slate-400">Active</span>}
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan="6" className="px-4 py-16 text-center text-slate-400">No tasks found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h4 className="font-semibold text-slate-900">Employee Workload</h4><p className="text-xs text-slate-500">{byEmployee.length} employees · click column headers to sort</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Tasks</th><th className="px-4 py-3 text-left">Completed</th><th className="px-4 py-3 text-left">Hours</th><th className="px-4 py-3 text-left">Productivity</th></tr></thead><tbody>{byEmployee.length ? byEmployee.map((row) => <tr key={row.key} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{row.label}</td><td className="px-4 py-3 text-slate-600">{row.total}</td><td className="px-4 py-3 text-slate-600">{row.completed}</td><td className="px-4 py-3 text-slate-600">{fmtHours(row.hours)}</td><td className="px-4 py-3 text-slate-600">{row.total ? Math.round((row.completed / row.total) * 100) : 0}%</td></tr>) : <tr><td colSpan="5" className="px-4 py-16 text-center text-slate-400">No employee data for the selected filters.</td></tr>}</tbody></table>
        </div>
      </section>
    </div>
  );
}

export default function TimesheetPage({ master = false }) {
  const { data } = useStore();
  const current = data.currentUser;
  const canTeam = master || userCanTeam(current);
  const [scope, setScope] = useState(master ? 'team' : 'self');
  const [view, setView] = useState(master ? 'analytics' : 'kanban');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [taskType, setTaskType] = useState('');
  const [archived, setArchived] = useState('active');
  const [source, setSource] = useState('');
  const [department, setDepartment] = useState('');
  const [project, setProject] = useState('');
  const [employee, setEmployee] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [dialogMessage, setDialogMessage] = useState('');

  const departments = (data.departments || []).filter((d) => d.is_active !== false);
  const users = (data.users || []).filter((u) => u.is_active !== false);
  const projects = data.projects || [];

  useEffect(() => {
    if (!canTeam && scope === 'team') setScope('self');
  }, [canTeam, scope]);

  useEffect(() => {
    if (!master && scope === 'self') {
      setEmployee('');
      setTeamMembers([]);
      return;
    }

    let cancelled = false;
    api(`/timesheet/team-members?master=${String(master)}`)
      .then((rows) => {
        if (cancelled) return;
        setTeamMembers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setTeamMembers([]);
      });

    return () => { cancelled = true; };
  }, [scope, master]);

  useEffect(() => {
    setEmployee('');
  }, [scope]);

  const makeQuery = useCallback((archivedFlag) => {
    const q = new URLSearchParams({ scope, master: String(master) });
    if (status) q.set('status', status);
    if (taskType) q.set('task_type', taskType);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (department) q.set('department_id', department);
    if (project) q.set('project_id', project);
    if ((scope === 'team' || master) && employee) q.set('assigned_user_id', employee);
    if (archivedFlag) q.set('archived', 'true');
    return q;
  }, [scope, master, status, taskType, from, to, department, project, employee]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let rows;
      if (archived === 'all') {
        const [activeRows, archivedRows] = await Promise.all([
          api(`/timesheet/tasks?${makeQuery(false)}`),
          api(`/timesheet/tasks?${makeQuery(true)}`),
        ]);
        rows = [...activeRows, ...archivedRows];
      } else {
        rows = await api(`/timesheet/tasks?${makeQuery(archived === 'archived')}`);
      }
      const unique = [...new Map((rows || []).map((row) => [row.id, row])).values()];
      setTasks(unique);
    } catch (err) {
      setError(err.message || 'Unable to load timesheet.');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [archived, makeQuery]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const rows = tasks.filter((task) => !source || task.task_source === source);
    if (scope === 'team' || master) {
      return [...rows].sort((a, b) => {
        const byName = taskEmployeeName(a).localeCompare(taskEmployeeName(b));
        if (byName) return byName;
        return String(a.start_date || '').localeCompare(String(b.start_date || ''));
      });
    }
    return rows;
  }, [tasks, source, scope, master]);
  const completed = visible.filter((t) => t.status === 'Completed').length;
  const inProgress = visible.filter((t) => t.status === 'In Progress').length;
  const pending = visible.filter((t) => !['Completed', 'In Progress'].includes(t.status)).length;
  const totalHours = visible.reduce((sum, t) => sum + Number(t.actual_hours || 0), 0);
  const productivity = visible.length ? Math.round((completed / visible.length) * 100) : 0;
  const employeeCount = new Set(visible.map((t) => t.assigned_user_id).filter(Boolean)).size;
  const projectCount = new Set(visible.map((t) => t.project_id).filter(Boolean)).size;

  const archiveTask = (task) => setArchiveConfirm(task);

  const confirmArchiveTask = async () => {
    const task = archiveConfirm;
    if (!task) return;
    setArchiveConfirm(null);
    try {
      await api(`/timesheet/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ is_archived: true }) });
      await load();
    } catch (err) { setDialogMessage(err.message || 'Unable to archive task.'); }
  };

  const restoreTask = async (task) => {
    try {
      await api(`/timesheet/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ is_archived: false }) });
      await load();
    } catch (err) { setDialogMessage(err.message || 'Unable to restore task.'); }
  };

  const changeStatus = async (task, nextStatus) => {
    try {
      await api(`/timesheet/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (err) { setDialogMessage(err.message || 'Unable to update task status.'); }
  };

  const title = master ? 'Timesheet Admin' : scope === 'team' ? 'Team Timesheet' : 'Timesheet';
  const tabs = [
    ['list', List, 'List'],
    ['kanban', Kanban, 'Kanban'],
    ['calendar', CalendarDays, 'Calendar'],
    ...(master ? [['analytics', BarChart2, 'Analytics']] : []),
  ];

  const openActiveView = (key) => {
    setArchived('active');
    setView(key);
  };

  const openArchivedView = () => {
    setArchived('archived');
    setView('archived');
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            {visible.length} task{visible.length === 1 ? '' : 's'} · {fmtRange(from, to)}
            {(scope === 'team' || master) && teamMembers.length ? ` · ${teamMembers.length} team member${teamMembers.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!master && canTeam ? (
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button type="button" onClick={() => setScope('self')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${scope === 'self' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Self</button>
              <button type="button" onClick={() => setScope('team')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${scope === 'team' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Team</button>
            </div>
          ) : null}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
            {tabs.map(([key, Icon, label]) => (
              <button key={key} type="button" onClick={() => openActiveView(key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${view === key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openArchivedView}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold shadow-sm transition ${view === 'archived' ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            title="View archived tasks"
          >
            <Archive size={15} /> Archived
          </button>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={16} /> Add Task</button>
        </div>
      </div>


      <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <DateRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 min-w-[132px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"><option value="">All Statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="h-9 min-w-[122px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"><option value="">All Types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 min-w-[124px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"><option value="">All Sources</option><option value="USER">USER</option><option value="PROJECT">PROJECT</option><option value="TICKET">TICKET</option></select>
          {departments.length ? <select value={department} onChange={(e) => setDepartment(e.target.value)} className="h-9 min-w-[150px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"><option value="">All Departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}</select> : null}
          {(scope === 'team' || master) ? (
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="h-9 min-w-[170px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <option value="">All Team Members</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}{member.departments?.length ? ` · ${member.departments.map((d) => d.name).filter(Boolean).join(', ')}` : ''}
                </option>
              ))}
            </select>
          ) : null}
          {projects.length ? <select value={project} onChange={(e) => setProject(e.target.value)} className="h-9 min-w-[190px] max-w-[240px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"><option value="">All Projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_no} · {p.project_name}</option>)}</select> : null}
          <button type="button" onClick={load} className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {view === 'archived' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Archived Tasks</h3>
            <p className="mt-0.5 text-xs text-slate-500">{visible.length} archived task{visible.length === 1 ? '' : 's'}. Use Unarchive to return a task to the active Timesheet.</p>
          </div>
          <button type="button" onClick={() => openActiveView('list')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw size={13} /> Back to Active Tasks
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-slate-100 bg-white py-20 text-center text-slate-400">Loading timesheet…</div>
      ) : view === 'list' || view === 'archived' ? (
        <ListView tasks={visible} onEdit={setEditing} onArchive={archiveTask} onRestore={restoreTask} />
      ) : view === 'kanban' ? (
        <KanbanView tasks={visible} onEdit={setEditing} onStatusDrop={changeStatus} members={teamMembers} currentUser={current} teamMode={scope === 'team' || master} />
      ) : view === 'calendar' ? (
        <CalendarView tasks={visible} onEdit={setEditing} />
      ) : (
        <AnalyticsView tasks={visible} departments={departments} users={users} projects={projects} from={from} to={to} onRestore={restoreTask} />
      )}

      {(editing || creating) ? <TaskModal task={editing} master={master} onClose={() => { setEditing(null); setCreating(false); }} onSaved={load} /> : null}
      <ConfirmDialog
        open={Boolean(archiveConfirm)}
        title="Archive Task?"
        message={archiveConfirm ? `Archive task “${archiveConfirm.title}”?` : ''}
        confirmLabel="Archive"
        danger
        onConfirm={confirmArchiveTask}
        onCancel={() => setArchiveConfirm(null)}
      />
      <AlertDialog open={Boolean(dialogMessage)} title="Timesheet Update Failed" message={dialogMessage} onClose={() => setDialogMessage('')} />
    </div>
  );
}

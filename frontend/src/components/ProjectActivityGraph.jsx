import React, { useMemo } from 'react';
import { Activity, CheckCircle2, Clock3, AlertTriangle, Inbox } from 'lucide-react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const statusScore = (status = '') => {
  const value = String(status).toLowerCase();
  if (value === 'completed') return 1;
  if (value === 'in progress') return 0.5;
  if (value === 'delay') return 0.35;
  if (value === 'on hold') return 0.2;
  return 0;
};

const statusClass = (status = '') => {
  const value = String(status).toLowerCase();
  if (value === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (value === 'in progress') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (value === 'delay') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (value === 'on hold') return 'bg-violet-50 text-violet-700 ring-violet-200';
  return 'bg-slate-50 text-slate-600 ring-slate-200';
};

const formatWhen = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const makePolyline = (values, width, height, pad) => {
  if (!values.length) return '';
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * usableW;
    const y = height - pad - (clamp(value, 0, 100) / 100) * usableH;
    return `${x},${y}`;
  }).join(' ');
};

export function planningScopes(rows = []) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = `${row.panel_key || row.panel || 'General'}__${row.department || 'General'}`;
    if (!map.has(key)) map.set(key, {
      key,
      panel: row.panel || 'General',
      department: row.department || 'General',
      rows: [],
      firstIndex: index,
    });
    map.get(key).rows.push(row);
  });
  return [...map.values()].sort((a, b) => a.firstIndex - b.firstIndex);
}

export default function ProjectActivityGraph({ project, auditLogs = [], scopeKey = '' }) {
  const scopes = useMemo(() => planningScopes(project?.planning_grid || []), [project]);
  const selected = useMemo(() => scopes.find((scope) => scope.key === scopeKey) || scopes[0] || null, [scopes, scopeKey]);
  const rows = selected?.rows || [];

  const metrics = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((row) => row.status === 'Completed').length;
    const inProgress = rows.filter((row) => row.status === 'In Progress').length;
    const delayed = rows.filter((row) => row.status === 'Delay').length;
    const hold = rows.filter((row) => row.status === 'On Hold').length;
    return { total, completed, inProgress, delayed, hold };
  }, [rows]);

  const expected = useMemo(() => rows.map((_, i) => Math.round(((i + 1) / Math.max(1, rows.length)) * 100)), [rows]);
  const actual = useMemo(() => {
    let earned = 0;
    return rows.map((row) => {
      earned += statusScore(row.status);
      return Math.round((earned / Math.max(1, rows.length)) * 100);
    });
  }, [rows]);

  const activity = useMemo(() => (auditLogs || [])
    .filter((log) => log.record_id === project?.id || log.new_values?.record_id === project?.id || log.old_values?.record_id === project?.id)
    .slice(0, 12), [auditLogs, project?.id]);

  if (!rows.length) {
    return <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><Inbox size={24} className="mb-2 text-slate-300"/><p className="text-sm font-semibold text-slate-700">No planning activity available</p><p className="mt-1 text-xs text-slate-500">Add planning tasks to the project to generate the activity graph.</p></div>;
  }

  const width = 760;
  const height = 280;
  const pad = 42;
  const expectedPoints = makePolyline(expected, width, height, pad);
  const actualPoints = makePolyline(actual, width, height, pad);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">{selected?.department} · {selected?.panel}</h3>
        <p className="mt-0.5 text-xs text-slate-500">Expected task progression compared with current execution status.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><Activity size={16} className="text-blue-600"/><p className="mt-2 text-xl font-bold text-blue-800">{metrics.total}</p><p className="text-xs text-blue-700">Expected Tasks</p></div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><CheckCircle2 size={16} className="text-emerald-600"/><p className="mt-2 text-xl font-bold text-emerald-800">{metrics.completed}</p><p className="text-xs text-emerald-700">Completed</p></div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><Clock3 size={16} className="text-amber-600"/><p className="mt-2 text-xl font-bold text-amber-800">{metrics.inProgress}</p><p className="text-xs text-amber-700">In Progress</p></div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><AlertTriangle size={16} className="text-rose-600"/><p className="mt-2 text-xl font-bold text-rose-800">{metrics.delayed + metrics.hold}</p><p className="text-xs text-rose-700">Delayed / Hold</p></div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs font-semibold"><span className="inline-flex items-center gap-1.5 text-blue-700"><i className="h-2.5 w-5 rounded-full bg-blue-600"/>Expected</span><span className="inline-flex items-center gap-1.5 text-emerald-700"><i className="h-2.5 w-5 rounded-full bg-emerald-600"/>Actual</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Project expected versus actual activity graph">
          {[0,25,50,75,100].map((value) => {
            const y = height - pad - (value / 100) * (height - pad * 2);
            return <g key={value}><line x1={pad} x2={width-pad} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1"/><text x={8} y={y+4} fontSize="11" fill="#64748b">{value}%</text></g>;
          })}
          <line x1={pad} x2={pad} y1={pad} y2={height-pad} stroke="#94a3b8" />
          <line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} stroke="#94a3b8" />
          <polyline points={expectedPoints} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={actualPoints} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {actual.map((value, index) => {
            const x = actual.length === 1 ? width / 2 : pad + (index / (actual.length - 1)) * (width - pad * 2);
            const y = height - pad - (value / 100) * (height - pad * 2);
            return <circle key={rows[index]?.id || index} cx={x} cy={y} r="4" fill="white" stroke="#16a34a" strokeWidth="2" />;
          })}
        </svg>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><h4 className="text-sm font-semibold text-slate-900">Task Status</h4></div>
        <div className="divide-y divide-slate-100">
          {rows.map((row, index) => <div key={row.id || index} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[36px_minmax(0,1fr)_150px_100px]"><span className="text-xs font-semibold text-slate-400">{index+1}</span><div><p className="text-sm font-medium text-slate-800">{row.task}</p><p className="text-[11px] text-slate-400">{row.assigned_to || 'Unassigned'}{row.planned_end ? ` · End ${row.planned_end}` : ''}</p></div><span className="text-xs text-slate-500">{row.department}</span><span className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${statusClass(row.status)}`}>{row.status || 'Pending'}</span></div>)}
        </div>
      </div>

      {activity.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><h4 className="text-sm font-semibold text-slate-900">Recent Activity</h4></div><div className="divide-y divide-slate-100">{activity.map((log) => <div key={log.id} className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-800">{log.user || 'System'} · {log.action}</p><span className="text-[11px] text-slate-400">{formatWhen(log.created_at)}</span></div><p className="mt-1 text-xs text-slate-500">{log.module}</p></div>)}</div></div>}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { PageHeader, SecondaryButton } from '../components/ui';

const timeText = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
};

const cardTone = (row) => {
  const event = String(row.event_type || '').toUpperCase();
  if (event.includes('TASK_ASSIGNED')) return { icon:'bg-violet-100 text-violet-700', badge:'bg-violet-50 text-violet-700 ring-violet-200', unread:'bg-violet-50/35' };
  if (event.includes('MEETING') || event.includes('KICKOFF')) return { icon:'bg-amber-100 text-amber-700', badge:'bg-amber-50 text-amber-700 ring-amber-200', unread:'bg-amber-50/30' };
  if (event.includes('CREATED')) return { icon:'bg-emerald-100 text-emerald-700', badge:'bg-emerald-50 text-emerald-700 ring-emerald-200', unread:'bg-emerald-50/30' };
  if (event.includes('STATUS')) return { icon:'bg-blue-100 text-blue-700', badge:'bg-blue-50 text-blue-700 ring-blue-200', unread:'bg-blue-50/35' };
  return { icon:'bg-slate-100 text-slate-600', badge:'bg-slate-50 text-slate-700 ring-slate-200', unread:'bg-slate-50/40' };
};

const eventLabel = (row) => String(row.event_type || 'Update')
  .replaceAll('_', ' ')
  .toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function NotificationsPage(){
  const navigate = useNavigate();
  const { refresh } = useStore();
  const [rows,setRows] = useState([]);
  const [filter,setFilter] = useState('unread');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api('/notifications')); setError(''); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const visible = useMemo(() => rows.filter((row) => filter === 'all' || (filter === 'unread' ? !row.is_read : row.is_read)), [rows,filter]);
  const unread = rows.filter((row)=>!row.is_read).length;

  const openRow = async (row) => {
    if (!row.is_read) {
      try { await api(`/notifications/${row.id}/read`, { method:'PATCH' }); await refresh(); } catch { /* navigation still works */ }
    }
    if (row.entity_type === 'INQUIRY' && row.entity_id) navigate(`/inquiries/${row.entity_id}/view`);
    else if (row.entity_type === 'PROJECT' && row.entity_id) navigate(`/projects/${row.entity_id}/view`);
    else if (row.entity_type === 'TICKET' && row.entity_id) navigate(`/tickets/${row.entity_id}/view`);
    else await load();
  };

  const markAll = async () => {
    try { await api('/notifications/read-all', { method:'PATCH' }); await Promise.all([load(), refresh()]); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="fade-in mx-auto max-w-6xl">
      <PageHeader title="Notifications" description="Unread notifications from the last 7 days are shown by default." action={<div className="flex gap-2"><SecondaryButton onClick={load}><RefreshCw size={14} className={loading?'animate-spin':''}/>Refresh</SecondaryButton>{unread>0&&<SecondaryButton onClick={markAll}><CheckCheck size={14}/>Mark all read</SecondaryButton>}</div>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[['all','All'],['unread',`Unread${unread?` (${unread})`:''}`],['read','Read']].map(([key,label])=><button key={key} onClick={()=>setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter===key?'bg-blue-600 text-white':'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
      </div>
      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {visible.length===0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">No {filter==='all'?'':filter} notifications.</div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((row)=>{
            const tone=cardTone(row);
            const payload=row.payload || {};
            return <button key={row.id} type="button" onClick={()=>openRow(row)} className={`group flex w-full items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md ${row.is_read?'bg-white':tone.unread}`}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}><Bell size={16}/></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{row.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone.badge}`}>{row.entity_type || 'SYSTEM'}</span>
                  {!row.is_read&&<span className="h-1.5 w-1.5 rounded-full bg-blue-600"/>}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{row.message}</span>
                {(payload.assigned_to || payload.department || payload.panel || payload.project_no) && <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {payload.assigned_to && <span><b className="font-semibold text-slate-600">Assigned:</b> {payload.assigned_to}</span>}
                  {payload.department && <span><b className="font-semibold text-slate-600">Department:</b> {payload.department}</span>}
                  {payload.panel && <span><b className="font-semibold text-slate-600">Panel:</b> {payload.panel}</span>}
                  {payload.project_no && <span><b className="font-semibold text-slate-600">Project:</b> {payload.project_no}</span>}
                </span>}
                <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400"><span>{eventLabel(row)}</span><span>•</span><span>{timeText(row.created_at)}</span></span>
              </span>
              <ExternalLink size={14} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-blue-500"/>
            </button>;
          })}
        </div>
      )}
    </div>
  );
}

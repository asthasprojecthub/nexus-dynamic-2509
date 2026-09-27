import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, LifeBuoy, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { matchesSearch, PageHeader, PrimaryButton, SearchBox, Select, Table } from '../components/ui';
import { RowActions } from '../components/RecordUI';
import { ticketCoreOptions } from '../utils/ticketFormOptions';

const dueText=(row)=>{
  if(row.closed_at)return <span className="text-emerald-700">Closed</span>;
  if(row.is_overdue)return <span className="inline-flex items-center gap-1 font-bold text-rose-700"><AlertTriangle size={12}/>Overdue</span>;
  return row.sla_due_at?<span className="inline-flex items-center gap-1 text-slate-600"><Clock3 size={12}/>{new Date(row.sla_due_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</span>:'—';
};

export default function TicketsPage(){
  const {data}=useStore();const navigate=useNavigate();
  const [q,setQ]=useState('');const [priority,setPriority]=useState('');const [overdue,setOverdue]=useState('');
  const ticketPermissions=data.currentUser?.permissions||[];
  const ticketWriteDepts=new Set(['AUTOMATION','STORE']);
  const isTicketWriteDept=data.currentUser?.role_code==='ADMIN' ||
    (data.currentUser?.departments||[]).some((name)=>ticketWriteDepts.has(String(name||'').trim().toUpperCase()));
  const canCreate=ticketPermissions.includes('TICKETS.CREATE') && isTicketWriteDept;
  const canUpdate=ticketPermissions.includes('TICKETS.UPDATE') && isTicketWriteDept;
  const activeTicketVersion=(data.ticketMaster?.versions||[]).find((item)=>item.is_active)||(data.ticketMaster?.versions||[])[0];
  const priorities=ticketCoreOptions(activeTicketVersion?.sections||[]).PRIORITY||[];
  const rows=useMemo(()=>{
    return (data.tickets||[]).filter((row)=>{
      if(!matchesSearch([row.ticket_no,row.customer,row.subject,row.ticket_type,row.problem_type,row.model_number,row.complaint,row.assigned_to,row.assigned_department],q))return false;
      if(priority&&row.priority!==priority)return false;
      if(overdue==='yes'&&!row.is_overdue)return false;if(overdue==='no'&&row.is_overdue)return false;return true;
    });
  },[data.tickets,q,priority,overdue]);
  const overdueCount=(data.tickets||[]).filter((row)=>row.is_overdue).length;
  return <div className="fade-in">
    <PageHeader title="Tickets" description={overdueCount ? `${overdueCount} overdue ticket${overdueCount===1?'':'s'}` : 'Manage support tickets and workflow.'} action={canCreate?<PrimaryButton onClick={()=>navigate('/tickets/new')}><Plus size={16}/>New Ticket</PrimaryButton>:null}/>
    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_150px_150px]"><SearchBox value={q} onChange={setQ} placeholder="Search ticket, customer, subject..."/><Select data-draft-ignore="true" value={priority} onChange={(e)=>setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map((item)=><option key={item}>{item}</option>)}</Select><Select data-draft-ignore="true" value={overdue} onChange={(e)=>setOverdue(e.target.value)}><option value="">All SLA</option><option value="yes">Overdue</option><option value="no">Within SLA</option></Select></div>
    <Table rows={rows} onRowClick={(row)=>navigate(`/tickets/${row.id}/view`)} columns={[
      {key:'serial',label:'Sr. No.',render:(_,row)=>rows.indexOf(row)+1},
      {key:'ticket_no',label:'Ticket',render:(value,row)=><div className="flex items-center gap-2"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><LifeBuoy size={15}/></span><div><p className="font-bold text-blue-700">{value}</p><p className="text-[10px] text-slate-400">{new Date(row.created_at).toLocaleString()}</p></div></div>},
      {key:'customer',label:'Customer',render:(value,row)=><div><p className="font-medium text-slate-900">{value}</p><p className="text-xs text-slate-500">{row.subject}</p></div>},
      {key:'ticket_type',label:'Type',render:(value,row)=><div><p className="font-medium">{value}</p><p className="text-xs text-slate-400">{row.problem_type}</p></div>},
      {key:'priority',label:'Priority',render:(value)=><span className={`font-semibold ${value==='Critical'?'text-rose-700':value==='High'?'text-amber-700':'text-slate-700'}`}>{value}</span>},
      {key:'assigned_to',label:'Assigned To',render:(value,row)=><div><p>{value||'Unassigned'}</p><p className="text-xs text-slate-400">{row.assigned_department||'No department'}</p></div>},
      {key:'current_phase',label:'Phase',render:(_,row)=><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Phase {row.current_phase}</span>},
      {key:'sla_due_at',label:'SLA',render:(_,row)=>dueText(row)},
      {key:'id',label:'Actions',render:(_,row)=><RowActions onView={()=>navigate(`/tickets/${row.id}/view`)} onEdit={canUpdate?()=>navigate(`/tickets/${row.id}/edit`):null}/>},
    ]}/>
  </div>;
}

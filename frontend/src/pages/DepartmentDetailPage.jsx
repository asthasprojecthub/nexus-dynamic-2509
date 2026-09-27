import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Field, Input, PrimaryButton, SecondaryButton, Toggle } from '../components/ui';
import { DetailHeader } from '../components/RecordUI';

export default function DepartmentDetailPage() {
  const { id } = useParams(); const navigate = useNavigate(); const { data, updateDepartmentMaster } = useStore();
  const record = useMemo(() => (data.departments || []).find((item) => item.id === id), [data.departments, id]);
  const [form, setForm] = useState(() => record ? { department_code: record.department_code || '', department_name: record.department_name || '', is_active: record.is_active !== false } : null);
  if (!record || !form) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Department not found.</div>;
  const save = (e) => { e.preventDefault(); updateDepartmentMaster(id, { department_code: form.department_code.trim().toUpperCase(), department_name: form.department_name.trim(), is_active: form.is_active }); navigate('/masters/departments'); };
  return <div className="fade-in mx-auto max-w-4xl"><DetailHeader title={`Edit ${record.department_name}`} subtitle="Department Master · Edit page" editing onBack={() => navigate('/masters/departments')}/><form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2"><Field label="Department Code" required><Input required value={form.department_code} onChange={(e)=>setForm((p)=>({...p,department_code:e.target.value}))}/></Field><Field label="Department Name" required><Input required value={form.department_name} onChange={(e)=>setForm((p)=>({...p,department_name:e.target.value}))}/></Field></div><div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="text-sm font-medium">Active Department</span><Toggle checked={form.is_active} onChange={(v)=>setForm((p)=>({...p,is_active:v}))}/></div><div className="mt-4 flex justify-end gap-2"><SecondaryButton type="button" onClick={()=>navigate('/masters/departments')}>Cancel</SecondaryButton><PrimaryButton type="submit">Save Changes</PrimaryButton></div></form></div>;
}

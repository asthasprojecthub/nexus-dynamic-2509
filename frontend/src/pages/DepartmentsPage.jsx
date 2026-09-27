import React, { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Field, Input, matchesSearch, PageHeader, PrimaryButton, SearchBox, SecondaryButton, Status, Table, Toggle } from '../components/ui';

const emptyForm = () => ({ department_code: '', department_name: '', is_active: true });

export default function DepartmentsPage({ createMode = false }) {
  const { data, add } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm);
  const rows = useMemo(() => (data.departments || []).filter((item) => matchesSearch([item.department_code, item.department_name], q)), [data.departments, q]);

  const submit = (event) => {
    event.preventDefault();
    add('departments', { ...form, department_code: form.department_code.trim().toUpperCase(), department_name: form.department_name.trim() });
    setForm(emptyForm());
    navigate('/masters/departments');
  };

  if (createMode) return (
    <div className="fade-in mx-auto max-w-4xl">
      <div className="mb-4">
        <button type="button" onClick={() => navigate('/masters/departments')} className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"><ArrowLeft size={16} /> Back</button>
        <div className="mt-1"><h1 className="text-xl font-bold text-slate-900 sm:text-2xl">New Department</h1><p className="text-sm text-slate-500">Departments drive planning tasks and user assignments.</p></div>
      </div>
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department Code" required><Input value={form.department_code} onChange={(e) => setForm((prev) => ({ ...prev, department_code: e.target.value }))} required placeholder="AUT" /></Field>
          <Field label="Department Name" required><Input value={form.department_name} onChange={(e) => setForm((prev) => ({ ...prev, department_name: e.target.value }))} required placeholder="Automation" /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div><p className="text-sm font-medium text-slate-700">Active Department</p><p className="text-xs text-slate-400">Inactive departments are hidden from new projects.</p></div><Toggle checked={form.is_active} onChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} /></div>
        <div className="mt-4 flex justify-end gap-2"><SecondaryButton type="button" onClick={() => navigate('/masters/departments')}>Cancel</SecondaryButton><PrimaryButton type="submit">Create Department</PrimaryButton></div>
      </form>
    </div>
  );

  return <div className="fade-in"><PageHeader title="Department Master" description="Departments used by project planning and user membership." action={<PrimaryButton onClick={() => navigate('/masters/departments/new')}><Plus size={16} /> Add Department</PrimaryButton>} /><div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="Search department..." /></div><Table rows={rows} onRowClick={(row) => navigate(`/masters/departments/${row.id}/edit`)} columns={[{ key: 'department_code', label: 'Code', render: (value) => <span className="font-semibold text-blue-700">{value}</span> }, { key: 'department_name', label: 'Department Name', render: (value) => <span className="font-medium text-slate-900">{value}</span> }, { key: 'is_active', label: 'Status', render: (value) => <Status value={value ? 'Active' : 'Inactive'} /> }, { key: 'id', label: 'Actions', render: (_, row) => <button type="button" onClick={()=>navigate(`/masters/departments/${row.id}/edit`)} title="Edit" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700"><Pencil size={15}/></button> }]} /></div>;
}

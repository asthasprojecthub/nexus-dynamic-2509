import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Field, Input, PrimaryButton, SecondaryButton, Select } from '../components/ui';
import { DetailHeader, Info } from '../components/RecordUI';

const emptyContact = () => ({ id: `cc-${Date.now()}-${Math.random()}`, contact_name: '', department_name: '', designation: '', stakeholder_role: '', email: '', phone: '', is_primary: false, is_active: true });
const TYPES = ['OEM', 'End User', 'Consultant', 'System Integrator', 'Panel Builder', 'Distributor', 'EPC', 'Other'];
const cleanMobile = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 10);
const isValidMobile = (value) => !value || /^\d{10}$/.test(String(value));

export default function CustomerDetailPage({ editable = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateCustomerMaster } = useStore();
  const canUpdate = (data.currentUser?.permissions || []).includes('CUSTOMERS.UPDATE');
  const record = useMemo(() => (data.customers || []).find((item) => item.id === id), [data.customers, id]);
  const initialType = TYPES.includes(record?.customer_type) ? record?.customer_type : (record?.customer_type ? 'Other' : '');
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState(() => record ? {
    customer_name: record.customer_name || '',
    customer_type: initialType,
    customer_type_other: initialType === 'Other' ? record.customer_type : '',
    city: record.city || '',
    contacts: JSON.parse(JSON.stringify(record.contacts || [])),
  } : null);

  if (!record || !form) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Customer not found.</div>;

  const setContact = (index, patch) => setForm((prev) => ({ ...prev, contacts: prev.contacts.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const save = (event) => {
    event.preventDefault();
    const invalidMobile = form.contacts.find((contact) => contact.contact_name.trim() && !isValidMobile(contact.phone));
    if (invalidMobile) {
      setSaveError(`Mobile number for ${invalidMobile.contact_name || 'contact'} must be exactly 10 digits.`);
      return;
    }
    setSaveError('');
    const customerType = form.customer_type === 'Other' ? form.customer_type_other.trim() : form.customer_type;
    updateCustomerMaster(id, {
      customer_name: form.customer_name.trim(),
      customer_type: customerType,
      city: form.city.trim(),
      contacts: form.contacts.filter((c) => c.contact_name.trim()).map((c) => ({ ...c, contact_name: c.contact_name.trim(), department_name: c.department_name.trim() })),
    });
    navigate('/customers');
  };

  if (!editable) return (
    <div className="fade-in mx-auto max-w-[1400px]">
      <DetailHeader title={record.customer_name} subtitle="Customer · Read-only view" onBack={() => navigate('/customers')} onEdit={canUpdate ? () => navigate(`/customers/${id}/edit`) : undefined} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Customer No." value={record.customer_no} />
        <Info label="Customer Name" value={record.customer_name} />
        <Info label="Customer Type" value={record.customer_type || '—'} />
        <Info label="City" value={record.city || '—'} />
        <Info label="Created By" value={record.created_by || '—'} />
        <Info label="Projects" value={record.project_count ?? 0} />
      </div>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2"><UserRound size={16} className="text-blue-600"/><h3 className="text-sm font-bold">Contact Details</h3></div>
        <div className="grid gap-2 lg:grid-cols-2">{(record.contacts || []).length ? record.contacts.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-800">{c.contact_name}</p>{c.is_primary && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">PRIMARY</span>}</div>
            <p className="mt-1 text-xs text-slate-500">Department: <span className="font-medium text-slate-700">{c.department_name || '—'}</span></p>
            <p className="text-xs text-slate-500">{c.designation || '—'} · {c.email || '—'} · {c.phone || '—'}</p>
          </div>
        )) : <p className="text-sm text-slate-400">No contacts.</p>}</div>
      </section>
    </div>
  );

  return (
    <div className="fade-in mx-auto max-w-[1400px]">
      <DetailHeader title={`Edit ${record.customer_name}`} subtitle="Customer · Edit page" editing onBack={() => navigate('/customers')} />
      <form onSubmit={save} className="space-y-3">
        {saveError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{saveError}</div>}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer No."><Input value={record.customer_no} disabled /></Field>
            <Field label="Customer Name" required><Input required value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} /></Field>
            <Field label="Customer Type" required><Select required value={form.customer_type} onChange={(e) => setForm((p) => ({ ...p, customer_type: e.target.value }))}><option value="">Select type</option>{TYPES.map((type) => <option key={type}>{type}</option>)}</Select></Field>
            {form.customer_type === 'Other' && <Field label="Other Type" required><Input required value={form.customer_type_other} onChange={(e) => setForm((p) => ({ ...p, customer_type_other: e.target.value }))} /></Field>}
            <Field label="City"><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="Enter city" /></Field>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">Contact Details</h3><p className="text-xs text-slate-400">Set the department directly against each contact.</p></div><SecondaryButton type="button" onClick={() => setForm((p) => ({ ...p, contacts: [...p.contacts, emptyContact()] }))}><Plus size={14}/> Add Contact</SecondaryButton></div>
          <div className="space-y-2">{form.contacts.map((c, i) => (
            <div key={c.id || i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Input required value={c.contact_name} onChange={(e)=>setContact(i,{contact_name:e.target.value})} placeholder="Contact name"/>
                <Input required value={c.department_name || ''} onChange={(e)=>setContact(i,{department_name:e.target.value})} placeholder="Department / Team"/>
                <Input value={c.designation || ''} onChange={(e)=>setContact(i,{designation:e.target.value})} placeholder="Designation"/>
                <Input value={c.stakeholder_role || ''} onChange={(e)=>setContact(i,{stakeholder_role:e.target.value})} placeholder="Stakeholder role"/>
                <Input type="email" value={c.email || ''} onChange={(e)=>setContact(i,{email:e.target.value})} placeholder="Email"/>
                <Input type="tel" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" title="Enter exactly 10 digits." value={c.phone || ''} onChange={(e)=>setContact(i,{phone:cleanMobile(e.target.value)})} placeholder="10-digit mobile number"/>
              </div>
              <div className="mt-2 flex items-center justify-between"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!c.is_primary} onChange={(e)=>setContact(i,{is_primary:e.target.checked})}/> Primary</label><button type="button" onClick={()=>setForm((p)=>({...p,contacts:p.contacts.filter((_,x)=>x!==i)}))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14}/></button></div>
            </div>
          ))}</div>
        </section>
        <div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={() => navigate('/customers')}>Cancel</SecondaryButton><PrimaryButton type="submit">Save Changes</PrimaryButton></div>
      </form>
    </div>
  );
}

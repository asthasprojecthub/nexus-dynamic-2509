import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, MapPin, Plus, Trash2, UserRound } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../api';
import { Field, Input, matchesSearch, PageHeader, PrimaryButton, SearchBox, SecondaryButton, Select, Table } from '../components/ui';
import { RowActions } from '../components/RecordUI';

const emptyContact = () => ({
  contact_name: '',
  department_name: '',
  designation: '',
  stakeholder_role: '',
  email: '',
  phone: '',
  is_primary: false,
  is_active: true,
});

const cleanMobile = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 10);
const isValidMobile = (value) => !value || /^\d{10}$/.test(String(value));

const emptyForm = () => ({
  customer_name: '',
  customer_type: '',
  customer_type_other: '',
  city: '',
  contacts: [emptyContact()],
});

export default function CustomersPage({ createMode = false }) {
  const { data, refresh } = useStore();
  const navigate = useNavigate();
  const permissions = new Set(data.currentUser?.permissions || []);
  const canCreate = permissions.has('CUSTOMERS.CREATE');
  const canUpdate = permissions.has('CUSTOMERS.UPDATE');
  const [searchParams] = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/inquiries') ? requestedReturnTo : '';
  const backTarget = returnTo || '/customers';
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const rows = useMemo(() => {
    return (data.customers || []).filter((item) => {
      const contacts = (item.contacts || []).map((contact) => `${contact.contact_name || ''} ${contact.email || ''} ${contact.department_name || ''}`).join(' ');
      return matchesSearch([item.customer_no, item.customer_name, item.customer_type, item.created_by, item.city, contacts], q);
    });
  }, [data.customers, q]);

  const updateContact = (index, key, value) => setForm((prev) => ({
    ...prev,
    contacts: prev.contacts.map((item, i) => i === index ? { ...item, [key]: value } : item),
  }));

  const submit = async (event) => {
    event.preventDefault();
    const contacts = form.contacts
      .filter((item) => item.contact_name.trim())
      .map((item) => ({ ...item, contact_name: item.contact_name.trim(), department_name: item.department_name.trim() }));
    const invalidMobile = contacts.find((item) => !isValidMobile(item.phone));
    if (invalidMobile) {
      setSaveError(`Mobile number for ${invalidMobile.contact_name || 'contact'} must be exactly 10 digits.`);
      return;
    }
    const customerType = form.customer_type === 'Other' ? form.customer_type_other.trim() : form.customer_type;
    const payload = {
      customer_name: form.customer_name.trim(),
      customer_type: customerType,
      city: form.city.trim(),
      customer_no: `CUS-${String((data.customers || []).length + 1).padStart(4, '0')}`,
      created_at: new Date().toISOString().slice(0, 10),
      contacts,
    };

    setSaving(true);
    setSaveError('');
    try {
      const created = await api('/customers', { method: 'POST', body: JSON.stringify(payload) });
      await refresh();
      setForm(emptyForm());
      if (returnTo) {
        const joiner = returnTo.includes('?') ? '&' : '?';
        navigate(`${returnTo}${joiner}customerId=${encodeURIComponent(created.id)}`);
      } else {
        navigate('/customers');
      }
    } catch (error) {
      setSaveError(error.message || 'Unable to create customer.');
    } finally {
      setSaving(false);
    }
  };

  if (createMode) return (
    <div className="fade-in mx-auto max-w-[1400px]">
      <div className="mb-4">
        <button type="button" onClick={() => navigate(backTarget)} className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"><ArrowLeft size={16} /> Back</button>
        <div className="mt-1"><h1 className="text-xl font-bold text-slate-900 sm:text-2xl">New Customer</h1><p className="text-sm text-slate-500">Create customer details and add department against each contact person.</p></div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {saveError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{saveError}</div>}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Building2 size={17} className="text-blue-600" /><h3 className="text-sm font-semibold text-slate-900">Customer Information</h3></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer Name" required><Input value={form.customer_name} onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))} required placeholder="Enter customer name" /></Field>
            <Field label="Customer Type" required><Select required value={form.customer_type} onChange={(e) => setForm((prev) => ({ ...prev, customer_type: e.target.value }))}><option value="">Select type</option><option>OEM</option><option>End User</option><option>Consultant</option><option>System Integrator</option><option>Panel Builder</option><option>Distributor</option><option>EPC</option><option>Other</option></Select></Field>
            {form.customer_type === 'Other' && <Field label="Other Type" required><Input required value={form.customer_type_other} onChange={(e) => setForm((prev) => ({ ...prev, customer_type_other: e.target.value }))} placeholder="Enter type" /></Field>}
            <Field label="City"><Input value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Enter city" /></Field>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-slate-900">Contact Details</h3><p className="text-xs text-slate-400">Department belongs to the contact person. There is no separate Customer Department section.</p></div>
            <SecondaryButton type="button" onClick={() => setForm((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }))} className="!py-1.5 !text-xs"><Plus size={14} /> Add Contact</SecondaryButton>
          </div>
          <div className="space-y-2">
            {form.contacts.map((contact, index) => (
              <div key={index} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Input required={index === 0 || !!contact.contact_name} value={contact.contact_name} onChange={(e) => updateContact(index, 'contact_name', e.target.value)} placeholder="Contact name" />
                  <Input required={!!contact.contact_name} value={contact.department_name} onChange={(e) => updateContact(index, 'department_name', e.target.value)} placeholder="Department / Team" />
                  <Input value={contact.designation} onChange={(e) => updateContact(index, 'designation', e.target.value)} placeholder="Designation" />
                  <Input value={contact.stakeholder_role} onChange={(e) => updateContact(index, 'stakeholder_role', e.target.value)} placeholder="Stakeholder role" />
                  <Input type="email" value={contact.email} onChange={(e) => updateContact(index, 'email', e.target.value)} placeholder="Email" />
                  <Input type="tel" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" title="Enter exactly 10 digits." value={contact.phone} onChange={(e) => updateContact(index, 'phone', cleanMobile(e.target.value))} placeholder="10-digit mobile number" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={contact.is_primary} onChange={(e) => updateContact(index, 'is_primary', e.target.checked)} /> Primary contact</label>
                  <button type="button" disabled={form.contacts.length === 1} onClick={() => setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }))} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 z-20 -mx-3 flex justify-end gap-2 border-t border-slate-200 bg-slate-100/95 px-3 py-2.5 backdrop-blur"><SecondaryButton type="button" onClick={() => navigate(backTarget)}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Customer'}</PrimaryButton></div>
      </form>
    </div>
  );

  const contactCell = (contacts = []) => {
    const contact = contacts.find((item) => item.is_primary) || contacts[0];
    if (!contact) return <span className="text-slate-400">—</span>;
    return <div className="min-w-[160px]"><div className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><UserRound size={13} className="text-slate-400" />{contact.contact_name || '—'}</div>{contacts.length > 1 && <div className="mt-0.5 text-[11px] font-medium text-blue-600">+{contacts.length - 1} more</div>}</div>;
  };

  return (
    <div className="fade-in">
      <PageHeader title="Customers" description="Manage customers and their primary contacts." action={canCreate ? <PrimaryButton onClick={() => navigate('/customers/new')}><Plus size={16} /> New Customer</PrimaryButton> : null} />
      <div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="Search by customer, contact or city..." /></div>
      <Table rows={rows} onRowClick={(row) => navigate(`/customers/${row.id}/view`)} columns={[
        { key: 'customer_no', label: 'ID', render: (value) => <span className="font-semibold text-blue-700">{value}</span> },
        { key: 'customer_name', label: 'Customer', render: (value) => <span className="font-medium text-slate-900">{value}</span> },
        { key: 'customer_type', label: 'Company Type', render: (value) => value || '—' },
        { key: 'created_by', label: 'Created By', render: (value) => value || '—' },
        { key: 'contacts', label: 'Contact', render: (value = []) => contactCell(value) },
        { key: 'city', label: 'City', render: (value) => value ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{value}</span> : '—' },
        { key: 'project_count', label: 'Projects', render: (value = 0) => <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-semibold text-blue-700">{value}</span> },
        { key: 'id', label: 'Actions', render: (_, row) => <RowActions onView={() => navigate(`/customers/${row.id}/view`)} onEdit={canUpdate ? () => navigate(`/customers/${row.id}/edit`) : null} /> },
      ]} />
    </div>
  );
}

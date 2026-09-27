import React from 'react';
import { ArrowLeft, Eye, Pencil } from 'lucide-react';
import { SecondaryButton } from './ui';
import { getSectionPastel } from '../utils/sectionPalette';

export const Info = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <div className="mt-0.5 break-words text-sm font-medium text-slate-800">{value || '—'}</div>
  </div>
);

export const DetailHeader = ({ title, subtitle, onBack, onEdit, editing = false, actions = null }) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div>
      <button type="button" onClick={onBack} className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70">
        <ArrowLeft size={16} /> Back
      </button>
      <div className="mt-1">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
      </div>
    </div>
    {(actions || (!editing && onEdit)) && <div className="flex flex-wrap items-center gap-2">{actions}{!editing && onEdit && <SecondaryButton type="button" onClick={onEdit}><Pencil size={14} /> Edit</SecondaryButton>}</div>}
  </div>
);

export const RowActions = ({ onView, onEdit }) => (
  <div className="flex items-center justify-end gap-1">
    <button type="button" onClick={onView} title="View" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"><Eye size={15} /></button>
    <button type="button" onClick={onEdit} title="Edit" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700"><Pencil size={15} /></button>
  </div>
);

const displayValue = (value) => {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value && typeof value === 'object' && value.__dynamic_document) return value.document_name || value.file_name || 'Document';
  if (value && typeof value === 'object' && Array.isArray(value.rows)) return `${value.rows.length} row${value.rows.length === 1 ? '' : 's'}`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value !== undefined && value !== null && value !== '' ? String(value) : '—';
};

function DataFieldGrid({ fields, values }) {
  const active = (fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!active.length) return null;
  return <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
    {active.map((field) => <div key={field.id} className={field.field_type === 'table' ? 'sm:col-span-2 lg:col-span-4' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{displayValue(values?.[field.id])}</p>
    </div>)}
  </div>;
}

export function SectionDataView({ sections, values }) {
  return <div className="space-y-3">
    {(sections || []).map((section, sectionIndex) => {
      const root = section.fields || [];
      const subs = (section.subsections || []).filter((sub) => (sub.fields || []).length > 0);
      if (!root.length && !subs.length) return null;
      const palette = getSectionPastel(sectionIndex);
      return <div key={section.id} className={`rounded-xl border p-3 ${palette.border} ${palette.surface}`}>
        <div className="mb-2"><p className={`text-sm font-semibold ${palette.title}`}>{section.title}</p>{section.description && <p className="text-xs text-slate-500">{section.description}</p>}</div>
        {root.length > 0 && <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><DataFieldGrid fields={root} values={values} /></div>}
        {subs.map((sub) => <div key={sub.id} className="mt-2 rounded-lg bg-white p-3 ring-1 ring-slate-200"><p className="mb-2 text-xs font-semibold text-slate-700">{sub.title}</p><DataFieldGrid fields={sub.fields} values={values} /></div>)}
      </div>;
    })}
  </div>;
}

export function FormStructureView({ sections = [] }) {
  return <div className="space-y-3">
    {sections.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-400">No sections configured.</div> : sections.map((section, sectionIndex) => { const palette = getSectionPastel(sectionIndex); return <section key={section.id} className={`rounded-xl border p-4 shadow-sm ${palette.border} ${palette.surface}`}>
      <div className="mb-3"><h3 className="text-sm font-bold text-slate-900">{section.title || 'Untitled Section'}</h3>{section.description && <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>}</div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Required</th></tr></thead>
          <tbody>
            {(section.fields || []).map((field) => <tr key={field.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-800">{field.label}</td><td className="px-3 py-2 capitalize text-slate-600">{field.field_type}</td><td className="px-3 py-2">{field.required ? 'Yes' : 'No'}</td></tr>)}
            {(section.subsections || []).map((sub) => <React.Fragment key={sub.id}>
              <tr className="border-t border-slate-200 bg-slate-50"><td colSpan="3" className="px-3 py-2 font-semibold text-slate-700">Sub-section: {sub.title}</td></tr>
              {(sub.fields || []).map((field) => <tr key={field.id} className="border-t border-slate-100"><td className="px-3 py-2 pl-6 font-medium text-slate-800">{field.label}</td><td className="px-3 py-2 capitalize text-slate-600">{field.field_type}</td><td className="px-3 py-2">{field.required ? 'Yes' : 'No'}</td></tr>)}
            </React.Fragment>)}
          </tbody>
        </table>
      </div>
    </section>; })}
  </div>;
}

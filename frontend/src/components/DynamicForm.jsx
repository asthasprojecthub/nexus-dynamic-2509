/**
 * DynamicForm.jsx
 * Renders Inquiry/Panel master sections, optional descriptions, sub sections,
 * and configured fields.
 */
import React, { useState } from 'react';
import { ChevronDown, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { getSectionPastel } from '../utils/sectionPalette';
import { useStore } from '../store';
import DocumentTypePicker from './DocumentTypePicker';
import { Field, Input, isPositiveDecimalInput, Modal, PrimaryButton, SecondaryButton } from './ui';

const newId = () => `r-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const errInputCls =
  'w-full rounded-lg border border-rose-300 bg-rose-50/30 px-3 py-2.5 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100';

const isMobileLike = (...parts) => /\b(mobile|phone|whatsapp|contact\s*(?:no|number))\b/i.test(parts.filter(Boolean).join(' ').replace(/[_-]+/g, ' '));
const cleanMobile = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 10);

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const kb = size / 1024;
  if (kb >= 1) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${size} B`;
};

function DynamicDocumentField({ field, value, onChange, error }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const [form, setForm] = useState({
    document_type_id: value?.document_type_id || '',
    document_name: value?.document_name || value?.file_name || '',
    file: null,
  });

  const resetFromValue = () => setForm({
    document_type_id: value?.document_type_id || '',
    document_name: value?.document_name || value?.file_name || '',
    file: null,
  });

  const choose = () => {
    resetFromValue();
    setLocalError('');
    setOpen(true);
  };

  const save = () => {
    if (!form.document_type_id) { setLocalError('Select Document Type and Subtype.'); return; }
    if (!String(form.document_name || '').trim()) { setLocalError('Enter Document Name.'); return; }
    if (!form.file) { setLocalError('Choose a file.'); return; }
    onChange({
      __dynamic_document: true,
      pending: true,
      document_type_id: form.document_type_id,
      document_name: String(form.document_name).trim(),
      file_name: form.file.name,
      file_size: form.file.size,
      file: form.file,
    });
    setOpen(false);
  };

  const displayName = value?.document_name || value?.file_name || (typeof value === 'string' ? value : '');
  const displaySize = value?.file_size ? formatFileSize(value.file_size) : '';

  return <>
    <button
      type="button"
      onClick={choose}
      className={`flex h-[42px] w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left transition hover:border-blue-400 hover:bg-blue-50/40 ${error ? 'border-rose-300' : 'border-slate-200'}`}
    >
        <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><FileText size={15}/></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-800">{displayName || `Add ${field.label || 'Document'}`}</span>
          <span className="block truncate text-[10px] text-slate-400">{displayName ? `${displaySize ? `${displaySize} · ` : ''}Click to update` : 'Select document and file'}</span>
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white"><Upload size={12}/>{displayName ? 'Update' : 'Upload'}</span>
    </button>

    {open && <Modal title={`${displayName ? 'Update' : 'Submit'} ${field.label || 'Document'}`} onClose={() => setOpen(false)}>
      <div className="space-y-4">
        {localError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{localError}</div>}
        <DocumentTypePicker
          documentTypes={data.documentTypes || []}
          value={form.document_type_id}
          onChange={(document_type_id) => { setForm((current) => ({ ...current, document_type_id })); setLocalError(''); }}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Document Name" required>
            <Input value={form.document_name} onChange={(e) => { setForm((current) => ({ ...current, document_name:e.target.value })); setLocalError(''); }} placeholder="e.g. Technical BOM Rev 1" />
          </Field>
          <Field label="File" required>
            <Input type="file" onChange={(e) => { const file=e.target.files?.[0] || null; setForm((current) => ({ ...current, file, document_name:current.document_name || file?.name || '' })); setLocalError(''); }} />
            {form.file && <p className="mt-1 text-[11px] text-slate-400">{form.file.name}{form.file.size ? ` · ${formatFileSize(form.file.size)}` : ''}</p>}
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={save}>{displayName ? 'Update Document' : 'Submit Document'}</PrimaryButton>
        </div>
      </div>
    </Modal>}
  </>;
}

/**
 * TableField
 * The first row of the table is always the HEADER row: it renders as
 * editable inputs (pre-filled with the column name configured in the
 * master, if any) so the person filling out the form can type in / rename
 * the column names themselves. Every row below that is a data row.
 *
 * Stored value shape: { headers: { [columnId]: string }, rows: [{ _id, [columnId]: value }] }
 * (Older data saved as a plain array of rows is still read correctly.)
 */
function TableField({ field, value, onChange }) {
  const cfg = field.table_config || {};
  const columns = cfg.columns?.length ? cfg.columns : [{ id: 'col-1', name: '', field_type: 'text', required: false }];
  const allowAddRows = cfg.allow_add_rows ?? true;
  const fixedRows = cfg.fixed_rows || 0;

  // Support both the current object shape and the legacy plain-array shape.
  const isLegacyArray = Array.isArray(value);
  const headers = (!isLegacyArray && value?.headers) || {};
  const rows = isLegacyArray ? value : Array.isArray(value?.rows) ? value.rows : [];

  const emptyRow = () =>
    Object.fromEntries([['_id', newId()], ...columns.map((column) => [column.id, ''])]);

  const displayRows =
    rows.length === 0 && fixedRows > 0
      ? Array.from({ length: fixedRows }, emptyRow)
      : rows;

  const updateHeader = (columnId, headerValue) =>
    onChange({ headers: { ...headers, [columnId]: headerValue }, rows: displayRows });

  const addRow = () => onChange({ headers, rows: [...displayRows, emptyRow()] });
  const removeRow = (index) => onChange({ headers, rows: displayRows.filter((_, i) => i !== index) });
  const updateCell = (index, columnId, cellValue) =>
    onChange({ headers, rows: displayRows.map((row, i) => (i === index ? { ...row, [columnId]: cellValue } : row)) });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          {/* Header row — editable so the user can enter/rename column names */}
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((column) => (
              <th key={column.id} className="min-w-[120px] px-2.5 py-2.5 text-left align-top">
                <input
                  type="text"
                  value={headers[column.id] ?? column.name ?? ''}
                  onChange={(e) => updateHeader(column.id, e.target.value)}
                  placeholder={column.name || 'Column name'}
                  className="w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {column.required && <span className="ml-1 text-rose-500">*</span>}
              </th>
            ))}
            {allowAddRows && <th className="w-10 px-2 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (allowAddRows ? 1 : 0)}
                className="py-8 text-center text-xs text-slate-400"
              >
                No rows yet. {allowAddRows && 'Click "Add Row" to add data.'}
              </td>
            </tr>
          ) : (
            displayRows.map((row, rowIndex) => (
              <tr key={row._id || rowIndex} className="border-b border-slate-100 last:border-b-0">
                {columns.map((column) => {
                  const mobileColumn = isMobileLike(headers[column.id], column.name);
                  return (
                    <td key={column.id} className="px-2.5 py-2">
                      <input
                        type={mobileColumn ? 'tel' : column.field_type === 'date' ? 'date' : 'text'}
                        inputMode={mobileColumn ? 'numeric' : column.field_type === 'number' ? 'decimal' : undefined}
                        maxLength={mobileColumn ? 10 : undefined}
                        pattern={mobileColumn ? '[0-9]{10}' : undefined}
                        title={mobileColumn ? 'Enter exactly 10 digits.' : undefined}
                        value={row[column.id] ?? ''}
                        onKeyDown={(e) => { if (column.field_type === 'number' && ['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                        onChange={(e) => {
                          const next = mobileColumn ? cleanMobile(e.target.value) : e.target.value;
                          if (column.field_type === 'number' && !isPositiveDecimalInput(next)) return;
                          updateCell(rowIndex, column.id, next);
                        }}
                        className="w-full min-w-[90px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                  );
                })}
                {allowAddRows && (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      disabled={fixedRows > 0 && rowIndex < fixedRows}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      title="Remove row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {allowAddRows && (
        <div className="border-t border-dashed border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
          >
            <Plus size={13} /> Add Row
          </button>
        </div>
      )}
    </div>
  );
}

function FieldRenderer({ field, value, onChange, error }) {
  const cls = error ? errInputCls : inputCls;
  const placeholder = field.placeholder || field.label || '';

  switch (field.field_type) {
    case 'text': {
      const mobileField = isMobileLike(field.label, field.field_key, field.fieldKey, field.placeholder);
      return (
        <input
          type={mobileField ? 'tel' : 'text'}
          inputMode={mobileField ? 'numeric' : undefined}
          maxLength={mobileField ? 10 : undefined}
          pattern={mobileField ? '[0-9]{10}' : undefined}
          title={mobileField ? 'Enter exactly 10 digits.' : undefined}
          className={cls}
          value={value ?? ''}
          onChange={(e) => onChange(mobileField ? cleanMobile(e.target.value) : e.target.value)}
          placeholder={mobileField ? '10-digit mobile number' : placeholder}
        />
      );
    }

    case 'number':
      return (
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
          className={cls}
          value={value ?? ''}
          onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
          onChange={(e) => { if (isPositiveDecimalInput(e.target.value)) onChange(e.target.value); }}
          placeholder={placeholder}
        />
      );

    case 'textarea':
      return (
        <textarea
          className={`${cls} h-[42px] resize-none`}
          rows={1}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className={cls}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'file':
      return <DynamicDocumentField field={field} value={value} onChange={onChange} error={error} />;

    case 'radio': {
      const options = field.options || [];
      const optionColumns = options.length <= 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : options.length === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-4';
      return (
        <div className={`grid min-w-0 gap-2.5 ${optionColumns}`}>
          {options.map((option, index) => (
            <label
              key={index}
              className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                value === option
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={`radio-${field.id}`}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="shrink-0 accent-blue-600"
              />
              <span className="min-w-0 break-words">{option}</span>
            </label>
          ))}
          {options.length === 0 && <span className="text-sm italic text-slate-400">No options configured.</span>}
        </div>
      );
    }

    case 'checkbox': {
      const options = field.options || [];
      const checked = Array.isArray(value) ? value : [];
      const toggle = (option) => {
        const next = checked.includes(option)
          ? checked.filter((item) => item !== option)
          : [...checked, option];
        onChange(next);
      };
      return (
        <details className="group relative">
          <summary className={`${cls} flex h-[42px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}>
            <span className={`min-w-0 truncate ${checked.length ? 'text-slate-800' : 'text-slate-400'}`}>
              {checked.length ? checked.join(', ') : `Select ${field.label}`}
            </span>
            <ChevronDown size={16} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
            {options.map((option, index) => (
              <label key={index} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={checked.includes(option)} onChange={() => toggle(option)} className="shrink-0 accent-blue-600" />
                <span className="min-w-0 break-words">{option}</span>
              </label>
            ))}
            {options.length === 0 && <span className="block px-2 py-2 text-sm italic text-slate-400">No options configured.</span>}
          </div>
        </details>
      );
    }

    case 'dropdown': {
      const options = field.options || [];
      return (
        <select className={cls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder || `Select ${field.label}`}</option>
          {options.map((option, index) => (
            <option key={index} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    case 'table':
      return <TableField field={field} value={value} onChange={onChange} />;

    default:
      return (
        <input
          type="text"
          className={cls}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      );
  }
}

function FieldGrid({ fields, values, onChange, errors }) {
  const activeFields = (fields || [])
    .filter((field) => field.is_active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!activeFields.length) return null;

  return (
    // 1 field per row on mobile, 2 on small screens, and up to 4 per row on
    // large screens. `min-w-0` on every cell (and the grid itself) stops long
    // labels/values/option pills from forcing horizontal overflow instead of
    // wrapping onto multiple lines.
    <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {activeFields.map((field) => {
        const span = field.field_type === 'table'
          ? 'sm:col-span-2 lg:col-span-4'
          : field.field_type === 'radio'
            ? 'sm:col-span-2 lg:col-span-2'
            : 'sm:col-span-1 lg:col-span-1';
        return (
          <div key={field.id} className={`min-w-0 ${span}`}>
            <div className="mb-1.5 break-words text-sm font-medium text-slate-700">
              {field.label}
              {field.required && <span className="ml-1 text-rose-500">*</span>}
            </div>
            <FieldRenderer
              field={field}
              value={values?.[field.id]}
              onChange={(value) => onChange(field.id, value)}
              error={errors[field.id]}
            />
            {errors[field.id] && <p className="mt-1 break-words text-xs text-rose-600">{errors[field.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function DynamicForm({ sections, values, onChange, errors = {}, embedded = false }) {
  if (!sections || sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-400">
        <p className="text-sm">No form fields configured.</p>
        <p className="mt-1 text-xs">Configure fields in the master settings first.</p>
      </div>
    );
  }

  const activeSections = sections
    .filter((section) => section.is_active !== false)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className={embedded ? "space-y-3" : "space-y-5"}>
      {activeSections.map((section, sectionIndex) => {
        const rootFields = (section.fields || []).filter((field) => field.is_active !== false);
        const activeSubsections = (section.subsections || [])
          .filter((subsection) => subsection.is_active !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .filter((subsection) => (subsection.fields || []).some((field) => field.is_active !== false));

        if (!rootFields.length && !activeSubsections.length) return null;

        const palette = getSectionPastel(sectionIndex);
        return (
          <section key={section.id} className={`${embedded ? 'rounded-xl p-3' : 'rounded-2xl p-4 sm:p-5'} min-w-0 border ${palette.border} ${palette.surface}`}>
            <div className={embedded ? "mb-3 min-w-0" : "mb-4 min-w-0"}>
              <h4 className={`break-words text-base font-semibold ${palette.title}`}>{section.title}</h4>
              {section.description && (
                <p className="mt-1 break-words text-sm leading-5 text-slate-500">{section.description}</p>
              )}
            </div>

            {rootFields.length > 0 && (
              <div className={embedded ? "min-w-0" : "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"}>
                <FieldGrid
                  fields={rootFields}
                  values={values}
                  onChange={onChange}
                  errors={errors}
                />
              </div>
            )}

            {activeSubsections.length > 0 && (
              <div className={`space-y-4 ${rootFields.length ? 'mt-4' : ''}`}>
                {activeSubsections.map((subsection) => (
                  <div key={subsection.id} className={embedded ? "min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 p-3" : "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"}>
                    <div className="mb-4 min-w-0 border-b border-slate-100 pb-3">
                      <h5 className="break-words text-sm font-semibold text-slate-800">{subsection.title}</h5>
                      {subsection.description && (
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500">{subsection.description}</p>
                      )}
                    </div>
                    <FieldGrid
                      fields={(subsection.fields || []).filter((field) => field.is_active !== false)}
                      values={values}
                      onChange={onChange}
                      errors={errors}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function validateFields(fields, values, errors) {
  (fields || []).filter((field) => field.is_active !== false).forEach((field) => {
    const value = values?.[field.id];
    const isEmpty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && isEmpty) {
      errors[field.id] = `${field.label} is required.`;
      return;
    }

    if (!isEmpty && isMobileLike(field.label, field.field_key, field.fieldKey, field.placeholder)) {
      if (!/^\d{10}$/.test(String(value))) errors[field.id] = `${field.label} must be exactly 10 digits.`;
    }

    if (!isEmpty && field.field_type === 'file' && value?.__dynamic_document && value.pending === true && (!value.file || typeof value.file.name !== 'string')) {
      errors[field.id] = `${field.label} file must be selected again.`;
      return;
    }

    if (!isEmpty && field.field_type === 'table') {
      const columns = field.table_config?.columns || [];
      const headers = (!Array.isArray(value) && value?.headers) || {};
      const rows = Array.isArray(value) ? value : (value?.rows || []);
      for (const column of columns) {
        if (!isMobileLike(headers[column.id], column.name)) continue;
        const invalid = rows.find((row) => row?.[column.id] && !/^\d{10}$/.test(String(row[column.id])));
        if (invalid) {
          errors[field.id] = `${headers[column.id] || column.name || 'Mobile number'} must be exactly 10 digits.`;
          break;
        }
      }
    }
  });
}

/**
 * validateDynamicForm – validates required fields from sections and sub sections.
 * Returns { isValid, errors } where errors is { [fieldId]: message }
 */
export function validateDynamicForm(sections, values) {
  const errors = {};
  (sections || []).filter((section) => section.is_active !== false).forEach((section) => {
    validateFields(section.fields, values, errors);
    (section.subsections || []).filter((subsection) => subsection.is_active !== false).forEach((subsection) => {
      validateFields(subsection.fields, values, errors);
    });
  });
  return { isValid: Object.keys(errors).length === 0, errors };
}

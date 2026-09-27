/**
 * dynamicDisplay.jsx
 * Small shared helpers for read-only rendering of DynamicForm values
 * (used by pages that display data captured against a master's sections,
 * e.g. Projects → Project Master / Planning Grid Master).
 */
import React from 'react';

export function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value && typeof value === 'object' && value.__dynamic_document) return value.document_name || value.file_name || 'Document';
  if (value && typeof value === 'object' && Array.isArray(value.rows)) {
    return `${value.rows.length} row${value.rows.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (value !== undefined && value !== null && value !== '') return String(value);
  return '—';
}

/** Look up a dynamic field's value by trying a list of possible labels (case-insensitive). */
export function getDynamicValueByLabels(sections, values, labels) {
  const wanted = new Set(labels.map((label) => label.trim().toLowerCase()));
  for (const section of sections || []) {
    const fields = [
      ...(section.fields || []),
      ...(section.subsections || []).flatMap((subsection) => subsection.fields || []),
    ];
    for (const field of fields) {
      if (wanted.has(String(field.label || '').trim().toLowerCase())) {
        const value = values?.[field.id];
        if (Array.isArray(value)) return value.join(', ');
        if (value !== undefined && value !== null && value !== '') return String(value);
      }
    }
  }
  return '';
}

/** Flatten every configured master field into one ordered list. */
export function flattenActiveFields(sections) {
  const out = [];
  (sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => out.push(field));
    (section.subsections || []).forEach((subsection) => (subsection.fields || []).forEach((field) => out.push(field)));
  });
  return out.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function DataFieldGrid({ fields, values }) {
  const activeFields = fields || [];
  if (!activeFields.length) return null;
  return (
    <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
      {activeFields.map((field) => (
        <div key={field.id}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
          <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{displayValue(values?.[field.id])}</p>
        </div>
      ))}
    </div>
  );
}

export function SectionDataView({ sections, values }) {
  if (!sections?.length) return null;
  return (
    <div className="space-y-4">
      {sections.map((section) => {
          const rootFields = section.fields || [];
          const subsections = (section.subsections || [])
            .filter((subsection) => (subsection.fields || []).length > 0);
          if (!rootFields.length && !subsections.length) return null;

          return (
            <div key={section.id} className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-slate-800">{section.title}</p>
                {section.description && <p className="mt-1 text-xs text-slate-500">{section.description}</p>}
              </div>

              {rootFields.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <DataFieldGrid fields={section.fields} values={values} />
                </div>
              )}

              {subsections.length > 0 && (
                <div className={`space-y-3 ${rootFields.length ? 'mt-3' : ''}`}>
                  {subsections.map((subsection) => (
                    <div key={subsection.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 border-b border-slate-100 pb-2.5">
                        <p className="text-xs font-semibold text-slate-700">{subsection.title}</p>
                        {subsection.description && <p className="mt-1 text-xs text-slate-400">{subsection.description}</p>}
                      </div>
                      <DataFieldGrid fields={subsection.fields} values={values} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

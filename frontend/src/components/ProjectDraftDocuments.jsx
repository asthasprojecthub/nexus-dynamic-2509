import React, { useState } from 'react';
import { FilePlus2, FileText, Plus, Trash2 } from 'lucide-react';
import DocumentTypePicker from './DocumentTypePicker';
import { Field, Input, Modal, PrimaryButton, SecondaryButton } from './ui';

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const kb = size / 1024;
  return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
};

export default function ProjectDraftDocuments({ documentTypes = [], value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ document_type_id: '', document_name: '', file: null, description: '', version_no: 1 });

  const reset = () => {
    setForm({ document_type_id: '', document_name: '', file: null, description: '', version_no: 1 });
    setError('');
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.document_type_id) { setError('Select Document Type and Subtype.'); return; }
    if (!form.document_name.trim()) { setError('Enter a document name.'); return; }
    if (!form.file) { setError('Choose a file.'); return; }
    onChange([...(value || []), { ...form, _key: uid(), version_no: Math.max(1, Number(form.version_no) || 1) }]);
    reset();
    setOpen(false);
  };

  const typeName = (id) => documentTypes.find((item) => item.id === id)?.document_type_name || 'Document';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Project Documents</h3>
          <p className="mt-0.5 text-xs text-slate-500">Files are uploaded after the project record is created, then linked securely to that project.</p>
        </div>
        <SecondaryButton type="button" onClick={() => { reset(); setOpen(true); }}><Plus size={14} /> Add Document</SecondaryButton>
      </div>

      {(value || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <FilePlus2 size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No project documents selected.</p>
          <p className="mt-1 text-xs text-slate-400">Documents are optional while creating a project.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(value || []).map((row) => (
            <div key={row._key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><FileText size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{row.document_name || row.file?.name || 'Selected file'}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{typeName(row.document_type_id)} · {formatFileSize(row.file?.size)} · Rev {row.version_no}{row.description ? ` · ${row.description}` : ''}</p>
              </div>
              <button type="button" onClick={() => onChange((value || []).filter((item) => item._key !== row._key))} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" title="Remove"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Add Project Document" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <DocumentTypePicker documentTypes={documentTypes} value={form.document_type_id} onChange={(document_type_id) => setForm((current) => ({ ...current, document_type_id }))} required />
            <Field label="Document Name" required><Input required value={form.document_name} onChange={(e) => setForm((current) => ({ ...current, document_name:e.target.value }))} placeholder="e.g. GA Drawing Rev 1" /></Field>
            <Field label="File" required><Input required type="file" onChange={(e) => { const file=e.target.files?.[0] || null; setForm((current) => ({ ...current, file, document_name:current.document_name || file?.name || '' })); }} />{form.file && <p className="mt-1 text-[11px] text-slate-400">Selected file size: {formatFileSize(form.file.size)}</p>}</Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Purpose / revision note" /></Field>
            <Field label="Revision / Version"><Input type="number" min="1" value={form.version_no} onChange={(e) => setForm((current) => ({ ...current, version_no: e.target.value }))} /></Field>
            <div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton><PrimaryButton type="submit">Add Document</PrimaryButton></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export async function uploadProjectDraftDocuments(api, projectId, documents = []) {
  for (const document of documents || []) {
    const form = new FormData();
    form.append('file', document.file);
    form.append('record_type', 'project');
    form.append('record_id', projectId);
    form.append('document_type_id', document.document_type_id);
    form.append('description', document.description || '');
    form.append('document_name', document.document_name || document.file?.name || '');
    form.append('version_no', String(Math.max(1, Number(document.version_no) || 1)));
    await api('/documents/upload', { method: 'POST', body: form });
  }
}

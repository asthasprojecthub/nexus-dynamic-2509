import React, { useMemo, useState } from 'react';
import { Download, FileText, Plus } from 'lucide-react';
import { useStore } from '../store';
import { apiBase } from '../api';
import DocumentTypePicker from './DocumentTypePicker';
import { Field, Input, Modal, PrimaryButton, SecondaryButton, Status } from './ui';

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return 'Secure download';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const kb = size / 1024;
  if (kb >= 1) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${size} B`;
};


export default function RecordDocuments({ recordType, recordId, readOnly = false, embedded = false }) {
  const { data, addRecordDocument } = useStore();
  const [open, setOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ document_type_id: '', document_name: '', file: null, description: '', version_no: 1 });
  const links = recordType === 'inquiry' ? data.inquiryDocuments : data.projectDocuments;
  const recordKey = recordType === 'inquiry' ? 'inquiry_id' : 'project_id';

  const rows = useMemo(() => (links || [])
    .filter((link) => link[recordKey] === recordId && link.is_active)
    .map((link) => {
      const doc = (data.documents || []).find((item) => item.id === link.document_id);
      const type = (data.documentTypes || []).find((item) => item.id === doc?.document_type_id);
      const parent = (data.documentTypes || []).find((item) => item.id === type?.parent_document_type_id);
      return doc ? {
        ...link,
        ...doc,
        link_id: link.id,
        description: link.description,
        document_type: type?.document_type_name || 'Other',
        document_title: parent?.document_type_name || type?.document_type_name || 'Other',
      } : null;
    })
    .filter(Boolean), [data.documents, data.documentTypes, links, recordId, recordKey]);

  const submit = async () => {
    setUploadError('');
    if (!form.document_type_id) { setUploadError('Select Document Type and Subtype.'); return; }
    if (!form.document_name.trim()) { setUploadError('Enter a document name.'); return; }
    if (!form.file) { setUploadError('Choose a file to upload.'); return; }
    setUploading(true);
    try {
      await addRecordDocument({
        recordType,
        recordId,
        documentTypeId: form.document_type_id,
        file: form.file,
        originalFileName: form.document_name.trim(),
        description: form.description,
        versionNo: form.version_no,
      });
      setForm({ document_type_id: '', document_name: '', file: null, description: '', version_no: 1 });
      setOpen(false);
    } catch (error) {
      setUploadError(error.message || 'Document upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (row) => {
    setDownloadError('');
    setDownloadingId(row.id);
    try {
      const token = localStorage.getItem('nexus_token');
      const response = await fetch(`${apiBase}/documents/${row.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = row.original_file_name || 'document';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error.message || 'Unable to download document.');
    } finally {
      setDownloadingId('');
    }
  };

  const content = <>
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
        <p className="mt-0.5 text-xs text-slate-500">Documents attached only to this {recordType}.</p>
      </div>
      {!readOnly && <SecondaryButton type="button" onClick={() => setOpen(true)}><Plus size={14}/>Add Document</SecondaryButton>}
    </div>

    {downloadError && <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{downloadError}</div>}

    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="border-b border-slate-200 bg-white">
          {['Document Type','Subtype','Document Name / File','Size','Description','Version','Uploaded By','Uploaded At','Status'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan="9" className="px-4 py-10 text-center text-sm text-slate-400">No documents attached to this {recordType}.</td></tr> : rows.map((row) => <tr key={row.link_id} className="border-b border-slate-100 last:border-b-0">
            <td className="px-4 py-3 font-medium text-slate-800">{row.document_title}</td>
            <td className="px-4 py-3 text-slate-700">{row.document_type === row.document_title ? '—' : row.document_type}</td>
            <td className="px-4 py-3"><button type="button" onClick={() => download(row)} disabled={downloadingId === row.id} className="flex items-center gap-2 text-left hover:text-blue-700 disabled:opacity-60"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><FileText size={15}/></span><div><p className="font-medium text-slate-800">{row.original_file_name}</p><p className="flex items-center gap-1 text-[11px] text-slate-400"><Download size={10}/>{downloadingId === row.id ? 'Downloading…' : 'Secure download'}</p></div></button></td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFileSize(row.file_size)}</td>
            <td className="max-w-[260px] px-4 py-3 text-slate-600">{row.description || '—'}</td>
            <td className="px-4 py-3 font-medium text-slate-700">Rev {row.version_no}</td>
            <td className="px-4 py-3 text-slate-600">{row.uploaded_by}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{row.uploaded_at}</td>
            <td className="px-4 py-3"><Status value={row.is_active ? 'Active' : 'Archived'}/></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {!readOnly && open && <Modal title={`Add ${recordType === 'inquiry' ? 'Inquiry' : 'Project'} Document`} onClose={() => !uploading && setOpen(false)}>
      <div className="space-y-4">
        {uploadError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{uploadError}</div>}
        <DocumentTypePicker documentTypes={data.documentTypes || []} value={form.document_type_id} onChange={(document_type_id) => setForm({...form, document_type_id})} required />
        <Field label="Document Name" required><Input required value={form.document_name} onChange={(e) => setForm({...form, document_name:e.target.value})} placeholder="e.g. Technical BOM Rev 1" /></Field>
        <Field label="File" required><Input required type="file" onChange={(e) => { const file=e.target.files?.[0] || null; setForm((current)=>({...current, file, document_name:current.document_name || file?.name || ''})); }}/>{form.file && <p className="mt-1 text-[11px] text-slate-400">Selected file size: {formatFileSize(form.file.size)}</p>}</Field>
        <Field label="Description"><Input value={form.description} onChange={(e) => setForm({...form, description:e.target.value})} placeholder="Purpose / revision note"/></Field>
        <Field label="Revision / Version"><Input type="number" min="1" value={form.version_no} onChange={(e) => setForm({...form, version_no:e.target.value})}/></Field>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">Files are stored privately and downloaded only through the authenticated document API.</div>
        <div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={() => setOpen(false)} disabled={uploading}>Cancel</SecondaryButton><PrimaryButton type="button" onClick={submit} disabled={uploading}>{uploading ? 'Uploading…' : 'Add Document'}</PrimaryButton></div>
      </div>
    </Modal>}
  </>;

  if (embedded) return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{content}</div>;
  return <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">{content}</section>;
}

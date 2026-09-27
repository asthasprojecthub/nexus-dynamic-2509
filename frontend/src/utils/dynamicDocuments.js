export const isPendingDynamicDocument = (value) => Boolean(
  value && typeof value === 'object' && value.__dynamic_document === true && value.pending === true && value.file && typeof value.file.name === 'string'
);

export const sanitizeDynamicDocumentValues = (values = {}) => Object.fromEntries(
  Object.entries(values || {}).map(([key, value]) => {
    if (!value || typeof value !== 'object' || value.__dynamic_document !== true) return [key, value];
    return [key, {
      __dynamic_document: true,
      pending: false,
      document_type_id: value.document_type_id || '',
      document_name: value.document_name || value.file_name || '',
      file_name: value.file_name || value.file?.name || '',
      file_size: Number(value.file_size || value.file?.size || 0),
    }];
  })
);

const flattenFields = (sections = []) => (sections || []).flatMap((section) => [
  ...(section.fields || []),
  ...(section.subsections || []).flatMap((subsection) => subsection.fields || []),
]);

export const collectDynamicDocumentDrafts = (sections = [], values = {}) => {
  const byId = new Map(flattenFields(sections).map((field) => [String(field.id), field]));
  return Object.entries(values || []).flatMap(([fieldId, value]) => {
    if (!isPendingDynamicDocument(value)) return [];
    const field = byId.get(String(fieldId));
    return [{
      field_id: fieldId,
      field_label: field?.label || 'Dynamic document',
      document_type_id: value.document_type_id || '',
      document_name: value.document_name || value.file?.name || '',
      file: value.file,
    }];
  });
};

export async function uploadDynamicDocumentDrafts(api, recordType, recordId, drafts = []) {
  for (const draft of drafts) {
    if (!draft?.file || !draft?.document_type_id) continue;
    const form = new FormData();
    form.append('file', draft.file);
    form.append('record_type', recordType);
    form.append('record_id', recordId);
    form.append('document_type_id', draft.document_type_id);
    form.append('document_name', draft.document_name || draft.file.name || 'Document');
    form.append('description', draft.field_label ? `Dynamic field: ${draft.field_label}` : 'Dynamic form document');
    form.append('version_no', '1');
    await api('/documents/upload', { method: 'POST', body: form });
  }
}

import React, { useEffect, useMemo, useState } from 'react';
import { Field, Select } from './ui';

export default function DocumentTypePicker({ documentTypes = [], value = '', onChange, required = false, errors = {} }) {
  const active = useMemo(() => (documentTypes || []).filter((item) => item.is_active !== false), [documentTypes]);
  const roots = useMemo(() => active.filter((item) => !item.parent_document_type_id), [active]);
  const selected = active.find((item) => item.id === value) || null;
  const [rootId, setRootId] = useState(selected?.parent_document_type_id || selected?.id || '');

  useEffect(() => {
    const item = active.find((entry) => entry.id === value);
    if (item) setRootId(item.parent_document_type_id || item.id);
    else if (!value) setRootId('');
  }, [active, value]);

  const children = useMemo(() => active.filter((item) => item.parent_document_type_id === rootId), [active, rootId]);
  const selectedChildId = selected?.parent_document_type_id === rootId ? selected.id : '';

  const chooseRoot = (nextRootId) => {
    setRootId(nextRootId);
    const rootChildren = active.filter((item) => item.parent_document_type_id === nextRootId);
    onChange(rootChildren.length ? '' : nextRootId);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Document Type" required={required}>
        <Select required={required} value={rootId} onChange={(e) => chooseRoot(e.target.value)}>
          <option value="">Select document type</option>
          {roots.map((item) => <option key={item.id} value={item.id}>{item.document_type_name}</option>)}
        </Select>
        {errors.type && <p className="mt-1 text-xs text-rose-600">{errors.type}</p>}
      </Field>
      <Field label="Subtype" required={required && children.length > 0}>
        <Select required={required && children.length > 0} value={selectedChildId} onChange={(e) => onChange(e.target.value)} disabled={!rootId || children.length === 0}>
          <option value="">{children.length ? 'Select subtype' : 'No subtype required'}</option>
          {children.map((item) => <option key={item.id} value={item.id}>{item.document_type_name}</option>)}
        </Select>
        {errors.subtype && <p className="mt-1 text-xs text-rose-600">{errors.subtype}</p>}
      </Field>
    </div>
  );
}

/**
 * FormBuilder.jsx
 * Shared Inquiry/Panel master builder.
 *
 * Structure:
 *   sections[]
 *     - title
 *     - description (optional)
 *     - fields[]
 *     - subsections[]
 *         - title
 *         - description (optional)
 *         - fields[]
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Circle,
  GripVertical,
  Hash,
  Layers3,
  List,
  Paperclip,
  Plus,
  Table2,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { ConfirmDialog, Input, Select, Textarea } from './ui';
import DynamicForm from './DynamicForm';
import { getSectionPastel } from '../utils/sectionPalette';

const newId = () => `f-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const FIELD_TYPES = [
  { value: 'text', label: 'Text Field', Icon: Type },
  { value: 'number', label: 'Number', Icon: Hash },
  { value: 'textarea', label: 'Text Area', Icon: AlignLeft },
  { value: 'radio', label: 'Radio Button', Icon: Circle },
  { value: 'checkbox', label: 'Checkbox', Icon: CheckSquare },
  { value: 'dropdown', label: 'Dropdown / Select', Icon: List },
  { value: 'date', label: 'Date', Icon: Calendar },
  { value: 'file', label: 'Document / File', Icon: Paperclip },
  { value: 'table', label: 'Table', Icon: Table2 },
];

const emptyField = (order = 1) => ({
  id: newId(),
  label: '',
  placeholder: '',
  field_type: 'text',
  required: false,
  is_active: true,
  order,
  options: [],
  table_config: {
    allow_add_rows: true,
    fixed_rows: 0,
    columns: [{ id: newId(), name: '', field_type: 'text', required: false }],
  },
});

const emptySubsection = (order = 1) => ({
  id: newId(),
  title: `Sub Section ${order}`,
  description: '',
  order,
  is_active: true,
  fields: [emptyField(1)],
});

const emptySection = (order = 1) => ({
  id: newId(),
  title: `Section ${order}`,
  description: '',
  order,
  is_active: true,
  fields: [emptyField(1)],
  subsections: [],
});

const getType = (type) => FIELD_TYPES.find((item) => item.value === type) || FIELD_TYPES[0];

const normalizeSections = (sections = []) =>
  sections.filter((section) => section.is_active !== false).map((section, sectionIndex) => ({
    ...section,
    is_active: true,
    description: section.description || '',
    order: section.order || sectionIndex + 1,
    fields: (section.fields || []).filter((field) => field.is_active !== false).map((field, fieldIndex) => ({
      ...field,
      is_active: true,
      placeholder: field.placeholder || '',
      order: field.order || fieldIndex + 1,
      options: field.options || [],
    })),
    subsections: (section.subsections || []).filter((subsection) => subsection.is_active !== false).map((subsection, subsectionIndex) => ({
      ...subsection,
      description: subsection.description || '',
      order: subsection.order || subsectionIndex + 1,
      is_active: true,
      fields: (subsection.fields || []).filter((field) => field.is_active !== false).map((field, fieldIndex) => ({
        ...field,
        is_active: true,
        placeholder: field.placeholder || '',
        order: field.order || fieldIndex + 1,
        options: field.options || [],
        })),
    })),
  }));

export const findMasterBuilderError = (sections = []) => {
  for (const section of sections || []) {
    if (!String(section.title || '').trim()) {
      return { message: 'Section title is required.', sectionId: section.id, targetId: `builder-section-${section.id}` };
    }
    for (const field of section.fields || []) {
      if (!String(field.label || '').trim()) {
        return { message: 'Field name is required. Enter the field name before saving.', sectionId: section.id, targetId: `builder-field-${field.id}` };
      }
    }
    for (const subsection of section.subsections || []) {
      if (!String(subsection.title || '').trim()) {
        return { message: 'Sub-section title is required.', sectionId: section.id, targetId: `builder-subsection-${subsection.id}` };
      }
      for (const field of subsection.fields || []) {
        if (!String(field.label || '').trim()) {
          return { message: 'Field name is required. Enter the field name before saving.', sectionId: section.id, targetId: `builder-field-${field.id}` };
        }
      }
    }
  }
  return null;
};

export const focusMasterBuilderError = (error) => {
  if (!error || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('nexus:master-builder-error', { detail: error }));
};

function SmallIconButton({ children, title, danger = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function OptionEditor({ field, onChange }) {
  const options = field.options || [];
  const addOption = () => onChange({ ...field, options: [...options, ''] });
  const updateOption = (index, value) =>
    onChange({ ...field, options: options.map((option, i) => (i === index ? value : option)) });
  const removeOption = (index) =>
    onChange({ ...field, options: options.filter((_, i) => i !== index) });

  return (
    <div className="mt-4 flex min-w-0 items-center gap-2 overflow-x-auto border-t border-slate-100 pt-4">
      <span className="shrink-0 text-xs font-semibold text-slate-600">Options</span>
      <div className="flex min-w-max items-center gap-2 pb-1">
        {options.map((option, index) => (
          <div key={index} className="flex w-52 shrink-0 items-center gap-1">
            <Input
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
              placeholder={`Option ${index + 1}`}
              className="!py-2 text-xs"
            />
            <SmallIconButton title="Remove option" danger onClick={() => removeOption(index)}>
              <X size={15} />
            </SmallIconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          title="Add option"
          aria-label="Add option"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 transition hover:bg-blue-50"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function InlineTableSizeEditor({ field, onChange }) {
  const cfg = field.table_config || { rows: 0, columns: [] };
  const columns = cfg.columns || [];
  const [manualSize, setManualSize] = useState({ rows: Math.max(1, Number(cfg.fixed_rows || Math.max((cfg.rows || 3) - 2, 1))), cols: Math.max(1, columns.length || 1) });
  const applySize = () => {
    const dataRows = manualSize.rows;
    const cols = manualSize.cols;
    const rows = Math.max(1, Number(dataRows) || 1) + 2;
    const safeCols = Math.max(1, Math.min(50, Number(cols) || 1));
    const safeDataRows = Math.max(1, Math.min(100, Number(dataRows) || 1));
    const old = cfg.columns || [];
    const oldRowHeaders = cfg.row_headers || [];
    const next = Array.from({ length: safeCols }, (_, i) =>
      old[i] || {
        id: newId(),
        name: `Column ${i + 1}`,
        field_type: 'text',
        required: false,
        options: [],
      }
    );
    onChange({
      ...field,
      table_config:{
        ...cfg,
        rows: safeDataRows + 2,
        fixed_rows: safeDataRows,
        columns: next,
        row_headers: Array.from({ length: safeDataRows }, (_, i) => oldRowHeaders[i] || `Row ${i + 1}`),
      },
    });
  };

  const digits = (value, maxLength) => String(value || '').replace(/\D/g, '').slice(0, maxLength);

  return (
    <div className="self-end">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Table Size</span>
      <div className="flex h-10 items-center gap-1.5">
        <Input aria-label="Rows" title="Rows" inputMode="numeric" value={manualSize.rows} onChange={(e)=>setManualSize((value)=>({...value,rows:digits(e.target.value,3)}))} placeholder="Rows" className="!w-16 !px-2 text-center" />
        <span className="shrink-0 text-sm font-bold text-slate-400">×</span>
        <Input aria-label="Columns" title="Columns" inputMode="numeric" value={manualSize.cols} onChange={(e)=>setManualSize((value)=>({...value,cols:digits(e.target.value,2)}))} placeholder="Cols" className="!w-16 !px-2 text-center" />
        <button type="button" onClick={applySize} className="h-10 shrink-0 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Apply</button>
      </div>
    </div>
  );
}

function TableConfigEditor({ field, onChange }) {
  const cfg = field.table_config || { rows: 0, columns: [] };
  const columns = cfg.columns || [];
  const rowHeaders = cfg.row_headers || [];

  const setConfig = (patch) =>
    onChange({ ...field, table_config: { ...cfg, ...patch } });

  const updateColumn = (index, patch) =>
    setConfig({
      columns: columns.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    });

  const updateRowHeader = (index, value) =>
    setConfig({
      row_headers: Array.from({ length: Math.max((cfg.rows || 0) - 2, 0) }, (_, i) =>
        i === index ? value : rowHeaders[i] || `Row ${i + 1}`
      ),
    });

  const updateColumnOption = (index, optionIndex, value) => {
    const opts = columns[index].options || [];
    updateColumn(index, {
      options: opts.map((o, i) => i === optionIndex ? value : o),
    });
  };

  const addOption = (index) =>
    updateColumn(index, {
      options: [...(columns[index].options || []), ''],
    });

  const removeOption = (index, optionIndex) =>
    updateColumn(index, {
      options: (columns[index].options || []).filter((_, i) => i !== optionIndex),
    });

  const previewValue = (column, rowIndex) => {
    const className = 'w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    const value = column.field_type === 'number' ? '123' : '';

    if (column.field_type === 'dropdown') {
      return (
        <select defaultValue="" className={className} aria-label={`${column.name || 'Column'} row ${rowIndex + 1}`}>
          <option value="">Select value</option>
          {(column.options || []).map((option, optionIndex) => (
            <option key={optionIndex} value={option}>{option || `Option ${optionIndex + 1}`}</option>
          ))}
        </select>
      );
    }

    if (column.field_type === 'checkbox') {
      return <input type="checkbox" className="h-4 w-4 rounded accent-blue-600" aria-label={`${column.name || 'Column'} row ${rowIndex + 1}`} />;
    }

    return (
      <input
        type={column.field_type === 'date' ? 'date' : 'text'}
        inputMode={column.field_type === 'number' ? 'decimal' : undefined}
        defaultValue={value}
        placeholder={column.field_type === 'radio' ? (column.options || []).join(', ') || 'Select option' : 'Enter value'}
        className={className}
        aria-label={`${column.name || 'Column'} row ${rowIndex + 1}`}
      />
    );
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex max-w-full flex-col gap-5 xl:flex-row">
        <div className="max-w-full overflow-x-auto rounded-xl border">
        <table className="min-w-max border-collapse text-sm">
          <tbody>
            {cfg.rows > 0 && (
              <tr className="bg-slate-50">
                <td className="border p-1.5">
                  <span className="block min-w-[95px] px-2 py-1.5 text-xs font-semibold text-slate-500">
                    Row Header
                  </span>
                </td>
                {columns.map((col, index) => (
                  <td key={col.id} className="border p-1.5">
                    <Input
                      value={col.name || ''}
                      onChange={(e) => updateColumn(index, { name: e.target.value })}
                      placeholder={`Header ${index + 1}`}
                      className="!min-w-[95px] !py-1.5 text-xs"
                    />
                  </td>
                ))}
              </tr>
            )}
            {cfg.rows > 1 && (
              <tr>
                <td className="border p-1.5">
                  <span className="block min-w-[95px] px-2 py-1.5 text-xs font-semibold text-slate-500">
                    Field Type
                  </span>
                </td>
                {columns.map((col, index) => (
                  <td key={col.id} className="border p-1.5">
                    <div className="flex min-w-max flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                      <Select
                        value={col.field_type}
                        onChange={(e) => updateColumn(index, { field_type: e.target.value })}
                        className="!min-w-[110px] !py-1.5 text-xs"
                      >
                        {FIELD_TYPES.filter((item) => item.value !== 'table' && item.value !== 'file').map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </Select>
                      <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50" title="Required">
                        <input
                          type="checkbox"
                          checked={!!col.required}
                          onChange={(e) => updateColumn(index, { required: e.target.checked })}
                          className="h-3.5 w-3.5 rounded accent-blue-600"
                          aria-label="Required"
                        />
                      </label>
                      {['radio', 'checkbox', 'dropdown'].includes(col.field_type) && (
                        <>
                        {(col.options || []).map((option, optionIndex) => (
                          <div key={optionIndex} className="flex w-36 shrink-0 items-center gap-1">
                            <Input
                              value={option}
                              onChange={(e) => updateColumnOption(index, optionIndex, e.target.value)}
                              placeholder={`Option ${optionIndex + 1}`}
                              className="!py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(index, optionIndex)}
                              className="text-slate-400 hover:text-rose-600"
                              title="Remove option"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(index)}
                          title="Add option"
                          aria-label="Add option"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                        >
                          <Plus size={14} />
                        </button>
                        </>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            )}
            {Array.from({ length: Math.max((cfg.rows || 0) - 2, 0) }).map((_, rowIndex) => (
              <tr key={`sample-${rowIndex}`}>
                <td className="border p-1.5">
                  <Input
                    value={rowHeaders[rowIndex] || ''}
                    onChange={(e) => updateRowHeader(rowIndex, e.target.value)}
                    placeholder={`Row ${rowIndex + 1}`}
                    className="!min-w-[95px] !py-1.5 text-xs"
                  />
                </td>
                {columns.map((col, index) => (
                  <td key={col.id} className="border px-2 py-2 text-xs text-slate-500">
                    {previewValue(col, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

    </div>
  );
}

// Field types that can meaningfully use a placeholder hint. Types like
// radio/checkbox/table/file drive their own UI instead, so the placeholder
// input is hidden for those — this is the "dynamically show the relevant
// field based on selected type" behaviour.
const PLACEHOLDER_TYPES = ['text', 'number', 'textarea', 'dropdown', 'date'];

function FieldConfigCard({ field, index, onChange, onRemove }) {
  const type = getType(field.field_type);
  const needsOptions = ['radio', 'checkbox', 'dropdown'].includes(field.field_type);
  const isTable = field.field_type === 'table';
  const showsPlaceholder = PLACEHOLDER_TYPES.includes(field.field_type);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <type.Icon size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {field.label || `Field ${index + 1}`}
            </p>
            <p className="text-xs text-slate-400">{type.label}</p>
          </div>
        </div>
        <SmallIconButton title="Delete field" danger onClick={onRemove}>
          <Trash2 size={17} />
        </SmallIconButton>
      </div>

      {/* Field Title is column 1, Field Type is column 2 — the rest of the
          card (placeholder, options, table config) adapts to whichever type
          is selected here. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_40px]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            <span className="text-rose-500">*</span> Field Title
          </span>
          <Input
            value={field.label || ''}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            placeholder="Enter field title"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            <span className="text-rose-500">*</span> Field Type
          </span>
          <Select
            value={field.field_type}
            onChange={(e) => onChange({ ...field, field_type: e.target.value })}
          >
            {FIELD_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </label>

        {showsPlaceholder && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Placeholder</span>
            <Input
              value={field.placeholder || ''}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              placeholder="Optional placeholder text"
            />
          </label>
        )}

        {isTable && <InlineTableSizeEditor field={field} onChange={onChange} />}

        <label className="flex h-10 w-10 cursor-pointer items-center justify-center self-end rounded-lg border border-slate-200 bg-slate-50 xl:col-start-4" title="Required">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onChange({ ...field, required: e.target.checked, is_active: true })}
            className="h-4 w-4 rounded accent-blue-600"
            aria-label="Required"
          />
        </label>

      </div>

      {/* Dynamically show the relevant config based on the selected type */}
      {needsOptions && <OptionEditor field={field} onChange={onChange} />}
      {isTable && <TableConfigEditor field={field} onChange={onChange} />}
    </div>
  );
}

function SidebarField({ field, dragging = false, onClick, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const type = getType(field.field_type);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-200 ${dragging ? 'opacity-50' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title="Click to open this field in the editor"
    >
      <span
        draggable
        onClick={(event) => event.stopPropagation()}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="shrink-0 cursor-grab text-slate-300 active:cursor-grabbing"
        title="Drag to reorder field"
      >
        <GripVertical size={14} />
      </span>
      <type.Icon size={15} className="shrink-0 text-blue-600" />
      <span className="min-w-0 flex-1 truncate font-medium">{field.label || type.label}</span>
    </div>
  );
}

export default function FormBuilder({ sections, onChange }) {
  const normalized = useMemo(() => normalizeSections(sections), [sections]);
  const [selectedSectionId, setSelectedSectionId] = useState(normalized[0]?.id || null);
  const [expanded, setExpanded] = useState(() => new Set(normalized[0]?.id ? [normalized[0].id] : []));
  const [builderTab, setBuilderTab] = useState('build');
  const [previewValues, setPreviewValues] = useState({});
  const [draggedSectionId, setDraggedSectionId] = useState(null);
  const [draggedFieldId, setDraggedFieldId] = useState(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [pendingFieldDelete, setPendingFieldDelete] = useState(null);

  useEffect(() => {
    const handleBuilderError = (event) => {
      const detail = event.detail || {};
      if (!detail.sectionId || !detail.targetId) return;
      setValidationMessage(detail.message || 'Complete the required field before saving.');
      setSelectedSectionId(detail.sectionId);
      setBuilderTab('build');
      setExpanded((prev) => new Set([...prev, detail.sectionId]));
      setPendingScrollTarget(detail.targetId);
      window.setTimeout(() => {
        document.getElementById(detail.targetId)?.querySelector('input, select, textarea')?.focus();
      }, 180);
    };
    window.addEventListener('nexus:master-builder-error', handleBuilderError);
    return () => window.removeEventListener('nexus:master-builder-error', handleBuilderError);
  }, []);

  useEffect(() => {
    if (!normalized.length) {
      setSelectedSectionId(null);
      return;
    }
    if (!normalized.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(normalized[0].id);
      setExpanded((prev) => new Set([...prev, normalized[0].id]));
    }
  }, [normalized, selectedSectionId]);

  useEffect(() => {
    if (!pendingScrollTarget || builderTab !== 'build') return undefined;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(pendingScrollTarget);
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      if (typeof target.animate === 'function') {
        target.animate(
          [
            { boxShadow: '0 0 0 0 rgba(37, 99, 235, 0)' },
            { boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.20)' },
            { boxShadow: '0 0 0 0 rgba(37, 99, 235, 0)' },
          ],
          { duration: 850, easing: 'ease-out' }
        );
      }
      setPendingScrollTarget(null);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [pendingScrollTarget, selectedSectionId, builderTab, normalized]);

  const openEditorTarget = (sectionId, targetId) => {
    setSelectedSectionId(sectionId);
    setBuilderTab('build');
    setExpanded((prev) => new Set([...prev, sectionId]));
    setPendingScrollTarget(targetId);
  };

  const commit = (nextSections) => {
    setValidationMessage('');
    onChange(normalizeSections(nextSections));
  };
  const selectedSection = normalized.find((section) => section.id === selectedSectionId) || null;
  const selectedSectionIndex = Math.max(0, normalized.findIndex((section) => section.id === selectedSectionId));
  const selectedPalette = getSectionPastel(selectedSectionIndex);

  const updateSection = (sectionId, patch) =>
    commit(normalized.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));

  const addSection = () => {
    const section = emptySection(normalized.length + 1);
    commit([...normalized, section]);
    setSelectedSectionId(section.id);
    setExpanded((prev) => new Set([...prev, section.id]));
    setBuilderTab('build');
  };

  const removeSection = (sectionId) => {
    const index = normalized.findIndex((section) => section.id === sectionId);
    const next = normalized.filter((section) => section.id !== sectionId).map((section, i) => ({ ...section, order: i + 1 }));
    commit(next);
    if (selectedSectionId === sectionId) {
      setSelectedSectionId(next[Math.max(0, index - 1)]?.id || next[0]?.id || null);
    }
  };

  const reorderSections = (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const next = [...normalized];
    const sourceIndex = next.findIndex((section) => section.id === sourceId);
    const targetIndex = next.findIndex((section) => section.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    commit(next.map((section, index) => ({ ...section, order: index + 1 })));
  };

  const toggleExpanded = (sectionId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const updateRootField = (sectionId, fieldId, updatedField) =>
    commit(
      normalized.map((section) =>
        section.id === sectionId
          ? { ...section, fields: section.fields.map((field) => (field.id === fieldId ? updatedField : field)) }
          : section
      )
    );

  const reorderFields = (sectionId, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    const fields = [...section.fields];
    const from = fields.findIndex((field) => field.id === sourceId);
    const to = fields.findIndex((field) => field.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    updateSection(sectionId, {
      fields: fields.map((field, index) => ({ ...field, order: index + 1 })),
    });
  };

  const reorderSubsectionFields = (sectionId, subsectionId, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const section = normalized.find((item) => item.id === sectionId);
    const subsection = section?.subsections.find((item) => item.id === subsectionId);
    if (!section || !subsection) return;
    const fields = [...subsection.fields];
    const from = fields.findIndex((field) => field.id === sourceId);
    const to = fields.findIndex((field) => field.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    updateSubsection(sectionId, subsectionId, {
      fields: fields.map((field, index) => ({ ...field, order: index + 1 })),
    });
  };

  const addRootField = (sectionId) => {
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    updateSection(sectionId, { fields: [...section.fields, emptyField(section.fields.length + 1)] });
  };

  const removeRootField = (sectionId, fieldId) => {
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      fields: section.fields.filter((field) => field.id !== fieldId).map((field, index) => ({ ...field, order: index + 1 })),
    });
  };

  const addSubsection = (sectionId) => {
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      subsections: [...section.subsections, emptySubsection(section.subsections.length + 1)],
    });
  };

  const updateSubsection = (sectionId, subsectionId, patch) => {
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      subsections: section.subsections.map((subsection) =>
        subsection.id === subsectionId ? { ...subsection, ...patch } : subsection
      ),
    });
  };

  const removeSubsection = (sectionId, subsectionId) => {
    const section = normalized.find((item) => item.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      subsections: section.subsections
        .filter((subsection) => subsection.id !== subsectionId)
        .map((subsection, index) => ({ ...subsection, order: index + 1 })),
    });
  };

  const addSubsectionField = (sectionId, subsectionId) => {
    const section = normalized.find((item) => item.id === sectionId);
    const subsection = section?.subsections.find((item) => item.id === subsectionId);
    if (!section || !subsection) return;
    updateSubsection(sectionId, subsectionId, {
      fields: [...subsection.fields, emptyField(subsection.fields.length + 1)],
    });
  };

  const updateSubsectionField = (sectionId, subsectionId, fieldId, updatedField) => {
    const section = normalized.find((item) => item.id === sectionId);
    const subsection = section?.subsections.find((item) => item.id === subsectionId);
    if (!section || !subsection) return;
    updateSubsection(sectionId, subsectionId, {
      fields: subsection.fields.map((field) => (field.id === fieldId ? updatedField : field)),
    });
  };

  const removeSubsectionField = (sectionId, subsectionId, fieldId) => {
    const section = normalized.find((item) => item.id === sectionId);
    const subsection = section?.subsections.find((item) => item.id === subsectionId);
    if (!section || !subsection) return;
    updateSubsection(sectionId, subsectionId, {
      fields: subsection.fields
        .filter((field) => field.id !== fieldId)
        .map((field, index) => ({ ...field, order: index + 1 })),
    });
  };

  const requestFieldDelete = (sectionId, field, subsectionId = null) => {
    setPendingFieldDelete({
      sectionId,
      subsectionId,
      fieldId: field.id,
      label: String(field.label || 'Untitled field').trim() || 'Untitled field',
    });
  };

  const confirmFieldDelete = () => {
    if (!pendingFieldDelete) return;
    if (pendingFieldDelete.subsectionId) {
      removeSubsectionField(
        pendingFieldDelete.sectionId,
        pendingFieldDelete.subsectionId,
        pendingFieldDelete.fieldId,
      );
    } else {
      removeRootField(pendingFieldDelete.sectionId, pendingFieldDelete.fieldId);
    }
    setPendingFieldDelete(null);
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      {/* Left: structure navigator */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Add Sections and Fields</h2>
          <p className="mt-1 text-sm text-slate-500">Use the six-dot handles to reorder sections and fields</p>
        </div>

        <div className="space-y-3">
          {normalized.map((section, sectionIndex) => {
            const isOpen = expanded.has(section.id);
            const isSelected = selectedSectionId === section.id;
            const palette = getSectionPastel(sectionIndex);
            return (
              <div
                key={section.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  reorderSections(draggedSectionId, section.id);
                  setDraggedSectionId(null);
                }}
                className={`rounded-xl border transition ${
                  isSelected ? `${palette.border} ${palette.surface} shadow-sm` : `border-slate-200 ${palette.nav}`
                } ${draggedSectionId === section.id ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 px-3 py-3">
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedSectionId(section.id);
                    }}
                    onDragEnd={() => setDraggedSectionId(null)}
                    className="shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
                    title="Drag to reorder section"
                  >
                    <GripVertical size={16} />
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditorTarget(section.id, `builder-section-${section.id}`)}
                    className="min-w-0 flex-1 text-left text-sm font-semibold text-slate-800"
                  >
                    {section.title || `Section ${sectionIndex + 1}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(section.id)}
                    className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
                    title={isOpen ? 'Collapse section' : 'Expand section'}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                    <div className="max-h-[260px] space-y-3 overflow-y-auto overscroll-contain pr-1" title="Scroll to view additional fields">
                      {section.fields.map((field) => (
                        <SidebarField
                          key={field.id}
                          field={field}
                          onClick={() => openEditorTarget(section.id, `builder-field-${field.id}`)}
                          dragging={draggedFieldId === field.id}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedFieldId(field.id);
                          }}
                          onDragEnd={() => setDraggedFieldId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            reorderFields(section.id, draggedFieldId, field.id);
                            setDraggedFieldId(null);
                          }}
                        />
                      ))}

                      {section.subsections.map((subsection) => (
                      <div key={subsection.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-2.5">
                        <button
                          type="button"
                          onClick={() => openEditorTarget(section.id, `builder-subsection-${subsection.id}`)}
                          className="mb-2 flex w-full items-center gap-2 text-left text-xs font-semibold text-slate-700 transition hover:text-blue-700"
                          title="Click to open this sub section in the editor"
                        >
                          <Layers3 size={14} className="text-slate-500" />
                          <span className="truncate">{subsection.title || 'Untitled Sub Section'}</span>
                        </button>
                        <div className="space-y-2 pl-1.5">
                          {subsection.fields.map((field) => (
                            <SidebarField
                              key={field.id}
                              field={field}
                              onClick={() => openEditorTarget(section.id, `builder-field-${field.id}`)}
                              dragging={draggedFieldId === field.id}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggedFieldId(field.id);
                              }}
                              onDragEnd={() => setDraggedFieldId(null)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                reorderSubsectionFields(section.id, subsection.id, draggedFieldId, field.id);
                                setDraggedFieldId(null);
                              }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => addSubsectionField(section.id, subsection.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                        >
                          <Plus size={12} /> Add Field
                        </button>
                      </div>
                      ))}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => addRootField(section.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        <Plus size={13} /> Add Field
                      </button>
                      <button
                        type="button"
                        onClick={() => addSubsection(section.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                      >
                        <Plus size={13} /> Sub Section
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addSection}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={16} /> Add Section
        </button>
      </aside>

      {/* Right: build / preview */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Preview</h2>
          <p className="mt-1 text-sm text-slate-500">Here you can preview the sections and form fields you have added.</p>
        </div>

        {validationMessage && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{validationMessage}</div>}

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setBuilderTab('build')}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              builderTab === 'build'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Build Template
          </button>
          <button
            type="button"
            onClick={() => {
              setBuilderTab('preview');
              setPreviewValues({});
            }}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              builderTab === 'preview'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Preview
          </button>
        </div>

        {builderTab === 'preview' ? (
          <DynamicForm
            sections={normalized}
            values={previewValues}
            onChange={(fieldId, value) => setPreviewValues((prev) => ({ ...prev, [fieldId]: value }))}
          />
        ) : selectedSection ? (
          <div className={`rounded-2xl border p-4 sm:p-6 ${selectedPalette.border} ${selectedPalette.surface}`}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-base font-semibold ${selectedPalette.title}`}>{selectedSection.title || 'Untitled Section'}</h3>
                <p className="mt-1 text-xs text-slate-500">Configure the selected section, its fields and optional sub sections.</p>
              </div>
              <SmallIconButton title="Delete section" danger onClick={() => removeSection(selectedSection.id)}>
                <Trash2 size={18} />
              </SmallIconButton>
            </div>

            {/* Section settings */}
            <div id={`builder-section-${selectedSection.id}`} className="mb-5 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    <span className="text-rose-500">*</span> Section Title
                  </span>
                  <Input
                    value={selectedSection.title || ''}
                    onChange={(e) => updateSection(selectedSection.id, { title: e.target.value })}
                    placeholder="Enter section title"
                  />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Section Description <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <Textarea
                  rows={3}
                  value={selectedSection.description || ''}
                  onChange={(e) => updateSection(selectedSection.id, { description: e.target.value })}
                  placeholder="Add a short description for this section"
                />
              </label>
            </div>

            {/* Direct fields */}
            <div className="space-y-4">
              {selectedSection.fields.map((field, index) => (
                <div
                  id={`builder-field-${field.id}`}
                  key={field.id}
                  draggable
                  onDragStart={() => setDraggedFieldId(field.id)}
                  onDragEnd={() => setDraggedFieldId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    reorderFields(selectedSection.id, draggedFieldId, field.id);
                    setDraggedFieldId(null);
                  }}
                  className={`scroll-mt-24 ${draggedFieldId === field.id ? 'opacity-50' : ''}`}
                >
                  <FieldConfigCard
                    field={field}
                    index={index}
                    onChange={(updated) => updateRootField(selectedSection.id, field.id, updated)}
                    onRemove={() => requestFieldDelete(selectedSection.id, field)}
                  />
                </div>
              ))}

              {selectedSection.fields.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
                  No direct fields in this section.
                </div>
              )}

              <button
                type="button"
                onClick={() => addRootField(selectedSection.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus size={14} /> Add Field
              </button>
            </div>

            {/* Sub sections */}
            <div className="mt-7 space-y-5">
              {selectedSection.subsections.map((subsection, subsectionIndex) => (
                <div id={`builder-subsection-${subsection.id}`} key={subsection.id} className="scroll-mt-24 rounded-2xl border border-blue-100 bg-white/70 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Layers3 size={16} className="text-slate-500" />
                      <h4 className="text-sm font-semibold text-slate-800">{subsection.title || `Sub Section ${subsectionIndex + 1}`}</h4>
                    </div>
                    <SmallIconButton
                      title="Delete sub section"
                      danger
                      onClick={() => removeSubsection(selectedSection.id, subsection.id)}
                    >
                      <Trash2 size={16} />
                    </SmallIconButton>
                  </div>

                  <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div>
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-slate-700">
                          <span className="text-rose-500">*</span> Sub Section Title
                        </span>
                        <Input
                          value={subsection.title || ''}
                          onChange={(e) => updateSubsection(selectedSection.id, subsection.id, { title: e.target.value })}
                          placeholder="Enter sub section title"
                        />
                      </label>
                    </div>
                    <label className="mt-4 block">
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">
                        Sub Section Description <span className="font-normal text-slate-400">(optional)</span>
                      </span>
                      <Textarea
                        rows={2}
                        value={subsection.description || ''}
                        onChange={(e) => updateSubsection(selectedSection.id, subsection.id, { description: e.target.value })}
                        placeholder="Optional description for this sub section"
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    {subsection.fields.map((field, fieldIndex) => (
                      <div id={`builder-field-${field.id}`} key={field.id} className="scroll-mt-24">
                        <FieldConfigCard
                          field={field}
                          index={fieldIndex}
                          onChange={(updated) =>
                            updateSubsectionField(selectedSection.id, subsection.id, field.id, updated)
                          }
                          onRemove={() => requestFieldDelete(selectedSection.id, field, subsection.id)}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSubsectionField(selectedSection.id, subsection.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                    >
                      <Plus size={14} /> Add Field to Sub Section
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addSubsection(selectedSection.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                <Plus size={14} /> Add Sub Section
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/30 px-5 py-14 text-center text-slate-400">
            <Layers3 size={34} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-slate-600">No section selected.</p>
            <p className="mt-1 text-xs">Add a section from the left panel to start building the form.</p>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(pendingFieldDelete)}
        title="Delete Field"
        message={`Are you sure you want to delete the field “${pendingFieldDelete?.label || ''}”?\n\nIt will be removed from this form version after you save the version.`}
        confirmLabel="Delete Field"
        onConfirm={confirmFieldDelete}
        onCancel={() => setPendingFieldDelete(null)}
        danger
      />
    </div>
  );
}

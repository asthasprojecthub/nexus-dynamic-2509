import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useStore } from '../store';

export const PageHeader = ({ title, description, action }) => (
  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const PrimaryButton = ({ children, className = '', ...props }) => (
  <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{children}</button>
);

export const SecondaryButton = ({ children, className = '', ...props }) => (
  <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 ${className}`}>{children}</button>
);

export const Card = ({ children, className = '' }) => <div className={`rounded-xl border border-slate-100 bg-white shadow-sm ${className}`}>{children}</div>;

export const Status = ({ value }) => {
  const normalized = String(value || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-700';
  if (['inactive', 'deactivated', 'archived', 'delete'].some((x) => normalized.includes(x))) cls = 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
  else if (['active', 'completed', 'converted', 'create'].some((x) => normalized.includes(x))) cls = 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  else if (['new', 'planning', 'technical'].some((x) => normalized.includes(x))) cls = 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
  else if (['progress', 'update'].some((x) => normalized.includes(x))) cls = 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{value}</span>;
};

const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export const matchesSearch = (values, query) => {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearchText(Array.isArray(values) ? values.flat(Infinity).join(' ') : values);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const numericTokens = haystack.match(/\d+(?:\.\d+)?/g) || [];
  return terms.every((term) => {
    if (haystack.includes(term) || compactHaystack.includes(term.replace(/\s+/g, ''))) return true;
    if (!/^\d+(?:\.\d+)?$/.test(term)) return false;
    const wanted = Number(term);
    return Number.isFinite(wanted) && numericTokens.some((token) => Number(token) === wanted);
  });
};

export const isPositiveDecimalInput = (value) => value === '' || /^\d*(?:\.\d*)?$/.test(String(value));

export const SearchBox = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative w-full sm:w-72">
    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input data-draft-ignore="true" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
    <button type="button" disabled={!value} onClick={() => onChange('')} aria-label="Clear search" title="Clear search" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-35"><X size={14} /></button>
  </div>
);

export const Table = ({ columns, rows, empty = 'No records found', onRowClick, pageSizeDefault = 25 }) => {
  const store = useStore();
  const currentUser = store?.data?.currentUser || null;
  const pageSizeOptions = [25, 50, 100];
  const initialPageSize = pageSizeOptions.includes(Number(pageSizeDefault)) ? Number(pageSizeDefault) : 25;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const safeRows = Array.isArray(rows) ? rows : [];
  const effectivePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : initialPageSize;
  const totalPages = safeRows.length ? Math.ceil(safeRows.length / effectivePageSize) : 0;
  const safePage = totalPages ? Math.min(Math.max(1, page), totalPages) : 0;
  const startIndex = safePage ? (safePage - 1) * effectivePageSize : 0;
  const visibleRows = safeRows.slice(startIndex, startIndex + effectivePageSize);
  const hasSerialColumn = columns.some((column) => column.key === 'serial' || /^sr\.?\s*(no\.?)?$/i.test(String(column.label || '').trim()));
  const displayColumns = hasSerialColumn
    ? columns
    : [{ key:'__serial', label:'Sr. No.', render:(_value,_row,rowIndex)=>startIndex + rowIndex + 1 }, ...columns];
  const isCurrentCreator = (column, row) => {
    if (!currentUser || !/created\s*by/i.test(String(column.label || ''))) return false;
    if (row?.created_by_id) return row.created_by_id === currentUser.id;
    const value = row?.[column.key];
    return value && String(value).trim().toLowerCase() === String(currentUser.full_name || '').trim().toLowerCase();
  };
  useEffect(() => { setPage(1); }, [safeRows.length, effectivePageSize]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50">{displayColumns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{c.label}</th>)}</tr></thead>
          <tbody>
            {visibleRows.length === 0 ? <tr><td colSpan={displayColumns.length} className="px-4 py-12 text-center text-slate-400">{empty}</td></tr> : visibleRows.map((row, idx) => <tr key={row.id || idx} onClick={(event) => { if (!onRowClick || event.target.closest('button,a,input,select,textarea,label')) return; onRowClick(row); }} className={`table-row-hover border-b border-slate-100 last:border-b-0 ${onRowClick ? 'cursor-pointer' : ''}`}>{displayColumns.map((c) => { const content=c.render ? c.render(row[c.key], row, idx) : row[c.key] ?? '—'; const currentCreator=isCurrentCreator(c,row); return <td key={c.key} className="px-3 py-2.5 text-slate-700">{currentCreator?<div className="flex items-center gap-1.5">{content}<span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">(You)</span></div>:content}</td>; })}</tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2.5 text-xs text-slate-500">
        <div className="flex items-center gap-2"><span>Show per page:</span><select data-draft-ignore="true" value={effectivePageSize} onChange={(e) => { const next=Number(e.target.value); if(pageSizeOptions.includes(next))setPageSize(next); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none">{pageSizeOptions.map((n)=><option key={n} value={n}>{n}</option>)}</select></div>
        <div className="flex items-center gap-1"><button type="button" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))} className="rounded-md border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"><ChevronLeft size={14}/></button><span className="rounded-md bg-blue-600 px-2.5 py-1.5 font-semibold text-white">{safePage} / {totalPages}</span><button type="button" disabled={!totalPages || safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="rounded-md border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"><ChevronRight size={14}/></button></div>
      </div>
    </div>
  );
};

export const Field = ({ label, children, required }) => <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</label>;
export const Input = ({ type, onChange, onKeyDown, inputMode, className = '', ...props }) => {
  const isNumber = type === 'number';
  const handleKeyDown = (event) => {
    if (isNumber && ['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
    onKeyDown?.(event);
  };
  const handleChange = (event) => {
    if (isNumber && !isPositiveDecimalInput(event.target.value)) return;
    onChange?.(event);
  };
  return <input {...props} type={isNumber ? 'text' : type} inputMode={isNumber ? 'decimal' : inputMode} pattern={isNumber ? '[0-9]*[.]?[0-9]*' : props.pattern} onChange={handleChange} onKeyDown={handleKeyDown} className={`h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`} />;
};
export const Select = ({ children, ...props }) => <select {...props} className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${props.className || ''}`}>{children}</select>;
export const Textarea = (props) => <textarea {...props} className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${props.className || ''}`} />;

export const Modal = ({ title, children, onClose, wide = false }) => (
  <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`max-h-[92vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button></div>
      <div className="max-h-[calc(92vh-65px)] overflow-y-auto p-5">{children}</div>
    </div>
  </div>
);

export const ConfirmDialog = ({ open, title = 'Please confirm', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger = false }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onCancel}>{cancelLabel}</SecondaryButton>
          <button type="button" onClick={onConfirm} className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition ${danger?'bg-rose-600 hover:bg-rose-700':'bg-blue-600 hover:bg-blue-700'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export const AlertDialog = ({ open, title = 'Notice', message, closeLabel = 'OK', onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end">
          <PrimaryButton type="button" onClick={onClose}>{closeLabel}</PrimaryButton>
        </div>
      </div>
    </div>
  );
};

export const Toggle = ({ checked, onChange }) => <button type="button" onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`}/></button>;

// ─── SectionCard ────────────────────────────────────────────────────────────
// A coloured, numbered section header + body card. Used to lay out long forms
// as a single stacked/scrollable page (see StepNav) instead of side-by-side
// or mutually-exclusive tab panels.
const SECTION_CARD_COLORS = {
  blue: { ring: 'border-blue-200', header: 'from-blue-50 to-indigo-50', badge: 'bg-blue-600', text: 'text-blue-700' },
  indigo: { ring: 'border-indigo-200', header: 'from-indigo-50 to-blue-50', badge: 'bg-indigo-600', text: 'text-indigo-700' },
  emerald: { ring: 'border-emerald-200', header: 'from-emerald-50 to-teal-50', badge: 'bg-emerald-600', text: 'text-emerald-700' },
  slate: { ring: 'border-slate-200', header: 'from-slate-50 to-gray-50', badge: 'bg-slate-600', text: 'text-slate-700' },
};

export const SectionCard = ({ number, title, subtitle, icon: Icon, color = 'blue', headerAction, children, className = '' }) => {
  const c = SECTION_CARD_COLORS[color] || SECTION_CARD_COLORS.blue;
  return (
    <div className={`overflow-hidden rounded-2xl border ${c.ring} bg-white shadow-sm ${className}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b ${c.ring} bg-gradient-to-r ${c.header} px-3 py-3 sm:px-4 sm:py-3`}>
        {number ? (
          <div className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-bold text-white shadow-sm ${c.badge}`}>
            {number}
          </div>
        ) : Icon ? (
          <div className="shrink-0 rounded-xl bg-white/80 p-2 shadow-sm">
            <Icon size={18} className={c.text} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className={`break-words text-sm font-semibold sm:text-base ${c.text}`}>{title}</h3>
          {subtitle && <p className="mt-0.5 break-words text-xs text-slate-500">{subtitle}</p>}
        </div>
        {Icon && number && <Icon size={18} className={`ml-auto shrink-0 opacity-40 ${c.text}`} />}
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
};

// ─── StepNav ─────────────────────────────────────────────────────────────────
// Compact pill navigation used to jump between stacked SectionCards on one
// page (click → smooth-scroll), instead of hiding/showing tab panels.
export const StepNav = ({ steps = [], active, onSelect, doneKeys = [] }) => (
  <div className="flex flex-wrap items-center gap-2">
    {steps.map((s, i) => {
      const isActive = active === s.key;
      const isDone = doneKeys.includes(s.key);
      return (
        <button
          key={s.key}
          type="button"
          onClick={() => onSelect(s.key)}
          className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
            isActive
              ? 'bg-blue-600 text-white shadow-sm'
              : isDone
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              isActive ? 'bg-white text-blue-700' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'
            }`}
          >
            {i + 1}
          </span>
          <span className="whitespace-nowrap">{s.label}</span>
        </button>
      );
    })}
  </div>
);

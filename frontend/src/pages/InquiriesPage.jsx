import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileText, PanelsTopLeft, Pencil, Plus, RefreshCw, Trash2,
} from 'lucide-react';
import { useStore } from '../store';
import { api, downloadApiFile } from '../api';
import {
  ConfirmDialog, Field, Input, matchesSearch, PageHeader, PrimaryButton, SearchBox, SecondaryButton,
  SectionCard, Select, StepNav,
} from '../components/ui';
import RecordDocuments from '../components/RecordDocuments';
import InquiryStatusModal, { INQUIRY_STATUSES, inquiryStatusNeedsPopup } from '../components/InquiryStatusModal';
import DynamicForm, { validateDynamicForm } from '../components/DynamicForm';
import KickoffWorkflowModal, { kickoffIsDue } from '../components/KickoffWorkflowModal';
import FixedTimelineFields, { addTimelineWeeks } from '../components/FixedTimelineFields';
import { collectDynamicDocumentDrafts, sanitizeDynamicDocumentValues, uploadDynamicDocumentDrafts } from '../utils/dynamicDocuments';


const financialYearLabel = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const uniq = (items = []) => [...new Set(items.filter(Boolean))];

const CUSTOM_STATUS_TONES = [
  'bg-cyan-100/80 border-cyan-200/80',
  'bg-indigo-100/80 border-indigo-200/80',
  'bg-fuchsia-100/80 border-fuchsia-200/80',
  'bg-teal-100/80 border-teal-200/80',
  'bg-lime-100/80 border-lime-200/80',
  'bg-pink-100/80 border-pink-200/80',
  'bg-purple-100/80 border-purple-200/80',
  'bg-sky-100/80 border-sky-200/80',
];

const customStatusTone = (status = '') => {
  const key = String(status || '').trim().toLowerCase();
  const hash = [...key].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 7);
  return CUSTOM_STATUS_TONES[hash % CUSTOM_STATUS_TONES.length];
};

const statusTone = (status = '') => {
  const key = String(status || '').trim().toLowerCase();
  let background = '';
  if (key === 'order won') background = 'bg-emerald-100/85 border-emerald-200/80';
  else if (key === 'order lost') background = 'bg-rose-100/85 border-rose-200/80';
  else if (key === 'inquiry hold') background = 'bg-orange-100/85 border-orange-200/80';
  else if (key === 'revision') background = 'bg-violet-100/85 border-violet-200/80';
  else if (key === 'technical bom submitted') background = 'bg-sky-100/85 border-sky-200/80';
  else if (key === 'bom approval pending') background = 'bg-yellow-100/85 border-yellow-200/80';
  else if (key === 'commercial bom submission') background = 'bg-indigo-100/85 border-indigo-200/80';
  else if (key === 'technical evaluation') background = 'bg-cyan-100/85 border-cyan-200/80';
  else if (key === 'new') background = 'bg-slate-100/90 border-slate-200/80';
  else background = customStatusTone(status);
  return `${background} text-slate-800 shadow-sm backdrop-blur-sm`;
};

const statusActionTone = (status = '') => {
  const key = String(status || '').trim().toLowerCase();
  let background = '';
  if (key === 'order lost') background = 'bg-rose-100/85 hover:bg-rose-200/80';
  else if (key === 'inquiry hold') background = 'bg-orange-100/85 hover:bg-orange-200/80';
  else if (key === 'order won') background = 'bg-emerald-100/85 hover:bg-emerald-200/80';
  else if (key === 'revision') background = 'bg-violet-100/85 hover:bg-violet-200/80';
  else if (key.includes('commercial')) background = 'bg-indigo-100/85 hover:bg-indigo-200/80';
  else if (key.includes('technical') || key.includes('bom')) background = 'bg-sky-100/85 hover:bg-sky-200/80';
  else background = customStatusTone(status).split(' ').filter((token) => token.startsWith('bg-')).join(' ');
  return `${background} text-slate-800 shadow-sm backdrop-blur-sm`;
};

const makeSeparateGrid = (index = 0, panelData = {}, groupQty = 1) => ({
  _key: `grid-${Date.now()}-${index}-${Math.random()}`,
  unit_no: index + 1,
  group_qty: Math.max(1, Number.parseInt(groupQty, 10) || 1),
  panel_data: JSON.parse(JSON.stringify(panelData || {})),
});

const emptyPanelEntry = (index = 0) => ({
  _key: `${Date.now()}-${index}-${Math.random()}`,
  panel_master_id: '',
  panel_no: `P-${String(index + 1).padStart(2, '0')}`,
  qty: 1,
  details_mode: 'common',
  panel_data: {},
  separate_grids: [],
});

const cleanQty = (value) => Math.max(1, Number.parseInt(value, 10) || 1);

const allocatedQty = (grids = []) => grids.reduce((sum, grid) => sum + Math.max(1, Number.parseInt(grid.group_qty, 10) || 1), 0);

const rebalanceSeparateQty = (grids = [], changedIndex, rawValue, totalQty) => {
  const total = cleanQty(totalQty);
  const count = Math.max(1, grids.length);
  const maxForTarget = Math.max(1, total - (count - 1));
  const desired = Math.max(1, Math.min(maxForTarget, Number.parseInt(rawValue, 10) || 1));
  const next = grids.map((grid) => ({ ...grid, group_qty: Math.max(1, Number.parseInt(grid.group_qty, 10) || 1) }));
  if (!next[changedIndex]) return next;
  next[changedIndex].group_qty = desired;
  let remaining = total - desired;
  const otherIndexes = next.map((_, index) => index).filter((index) => index !== changedIndex);
  for (let pos = 0; pos < otherIndexes.length; pos += 1) {
    const index = otherIndexes[pos];
    const remainingSlots = otherIndexes.length - pos - 1;
    const maxHere = Math.max(1, remaining - remainingSlots);
    const qty = Math.max(1, Math.min(next[index].group_qty, maxHere));
    next[index].group_qty = qty;
    remaining -= qty;
  }
  if (remaining > 0 && otherIndexes.length) next[otherIndexes[otherIndexes.length - 1]].group_qty += remaining;
  return next.map((grid, index) => ({ ...grid, unit_no:index + 1 }));
};

const normalizeSeparateGrids = (entry, qty, minimum = 0) => {
  const existing = Array.isArray(entry.separate_grids) ? entry.separate_grids : [];
  const target = Math.min(qty, Math.max(minimum, existing.length));
  const grids = existing.slice(0, target).map((grid, index) => ({
    ...grid,
    unit_no: index + 1,
    group_qty: Math.max(1, Number.parseInt(grid.group_qty, 10) || 1),
    panel_data: grid.panel_data || {},
  }));
  while (grids.length < target) grids.push(makeSeparateGrid(grids.length, grids.length === 0 ? entry.panel_data : {}, 1));
  if (!grids.length) return grids;
  let total = allocatedQty(grids);
  if (total < qty) grids[grids.length - 1] = { ...grids[grids.length - 1], group_qty: grids[grids.length - 1].group_qty + (qty - total) };
  if (total > qty) {
    let extra = total - qty;
    for (let index = grids.length - 1; index >= 0 && extra > 0; index -= 1) {
      const reducible = Math.max(0, grids[index].group_qty - 1);
      const reduceBy = Math.min(reducible, extra);
      grids[index] = { ...grids[index], group_qty: grids[index].group_qty - reduceBy };
      extra -= reduceBy;
    }
  }
  return grids.map((grid, index) => ({ ...grid, unit_no: index + 1 }));
};

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value && typeof value === 'object' && Array.isArray(value.rows)) return `${value.rows.length} row${value.rows.length === 1 ? '' : 's'}`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value !== undefined && value !== null && value !== '' ? String(value) : '—';
}

function DataFieldGrid({ fields, values }) {
  const active = (fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!active.length) return null;
  return (
    <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {active.map((field) => (
        <div key={field.id} className={field.field_type === 'table' ? 'sm:col-span-2 lg:col-span-4' : ''}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
          <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{displayValue(values?.[field.id])}</p>
        </div>
      ))}
    </div>
  );
}

function SectionDataView({ sections, values }) {
  return (
    <div className="space-y-3">
      {(sections || []).map((section) => {
        const root = section.fields || [];
        const subs = (section.subsections || []).filter((sub) => (sub.fields || []).length > 0);
        if (!root.length && !subs.length) return null;
        return (
          <div key={section.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2"><p className="text-sm font-semibold text-slate-800">{section.title}</p>{section.description && <p className="text-xs text-slate-400">{section.description}</p>}</div>
            {root.length > 0 && <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><DataFieldGrid fields={root} values={values} /></div>}
            {subs.map((sub) => <div key={sub.id} className="mt-2 rounded-lg bg-white p-3 ring-1 ring-slate-200"><p className="mb-2 text-xs font-semibold text-slate-700">{sub.title}</p><DataFieldGrid fields={sub.fields} values={values} /></div>)}
          </div>
        );
      })}
    </div>
  );
}

export default function InquiriesPage({ createMode = false }) {
  const { data, refresh } = useStore();
  const navigate = useNavigate();
  const permissions = new Set(data.currentUser?.permissions || []);
  const canCreate = permissions.has('INQUIRIES.CREATE');
  const canUpdate = permissions.has('INQUIRIES.UPDATE');
  const canChangeStatus = permissions.has('INQUIRIES.STATUS_CHANGE');
  const canUseKickoff = permissions.has('INQUIRIES.KICKOFF') || permissions.has('INQUIRIES.CONVERT_TO_PROJECT');
  const canUpdateProject = permissions.has('PROJECTS.UPDATE');
  const [searchParams] = useSearchParams();
  const returningCustomerId = searchParams.get('customerId') || '';
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [panelFilter, setPanelFilter] = useState('');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [fyFilter, setFyFilter] = useState(() => financialYearLabel(new Date()));
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [activeNav, setActiveNav] = useState('inquiry');
  const [core, setCore] = useState({ customer_id: '', project_name: '', inquiry_date: '', timeline_weeks: '', order_expected_end_date: '', actual_end_date: '', status: 'New' });
  const [coreErrors, setCoreErrors] = useState({});
  const [generalValues, setGeneralValues] = useState({});
  const [generalErrors, setGeneralErrors] = useState({});
  const [panelEntries, setPanelEntries] = useState([emptyPanelEntry(0)]);
  const [panelErrors, setPanelErrors] = useState({});
  const [panelMessage, setPanelMessage] = useState('');
  const [statusModal, setStatusModal] = useState(null);
  const [statusChangingId, setStatusChangingId] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusConfirm,setStatusConfirm]=useState(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState('');
  const [statusDetails, setStatusDetails] = useState(null);
  const [statusDetailsLoading, setStatusDetailsLoading] = useState(false);
  const [statusDetailsError, setStatusDetailsError] = useState('');
  const [kickoffModal, setKickoffModal] = useState(null);
  const [, setClockTick] = useState(0);
  const sectionRefs = useRef({});
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!createMode || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const saved = sessionStorage.getItem('nexus-inquiry-create-draft');
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.core) setCore(draft.core);
        if (draft.generalValues) setGeneralValues(draft.generalValues);
        if (Array.isArray(draft.panelEntries) && draft.panelEntries.length) setPanelEntries(draft.panelEntries);
      }
    } catch (_) {
      // Ignore an invalid local draft and continue with a clean inquiry.
    }
  }, [createMode]);

  useEffect(() => {
    if (createMode && returningCustomerId) {
      setCore((prev) => ({ ...prev, customer_id: returningCustomerId }));
    }
  }, [createMode, returningCustomerId]);

  const activeMasterVersion = data.inquiryMaster?.versions?.find((v) => v.is_active);
  const masterSections = activeMasterVersion?.sections || [];
  const activePanels = (data.panelMasters || []).filter((panel) => panel.is_active && panel.versions?.some((v) => v.is_active));
  const activeCustomers = (data.customers || []).filter((customer) => customer.is_active !== false);

  const downloadInquiryPdf = async (row) => {
    if (!row?.id || pdfDownloadingId) return;
    setPdfDownloadingId(row.id);
    setStatusError('');
    try {
      const projectPart = row.project_no ? `-${row.project_no}` : '';
      await downloadApiFile(`/inquiries/${row.id}/pdf`, `Inquiry-${row.inquiry_no}${projectPart}.pdf`);
    } catch (error) {
      setStatusError(error.message || 'Unable to generate Inquiry PDF.');
    } finally {
      setPdfDownloadingId('');
    }
  };

  const applySimpleStatusChange = async (inquiry,nextStatus) => {
    setStatusChangingId(inquiry.id);
    setStatusError('');
    try {
      const body = new FormData();
      body.append('to_status', nextStatus);
      await api(`/inquiries/${inquiry.id}/status`, { method: 'POST', body });
      await refresh();
    } catch (error) {
      setStatusError(error.message || 'Unable to update inquiry status.');
    } finally {
      setStatusChangingId('');
    }
  };

  const handleStatusChange = async (inquiry, nextStatus) => {
    if (!inquiry || !nextStatus || nextStatus === inquiry.status) return;

    // Match the old Nexus workflow: only statuses that need extra information
    // open a popup. Simple statuses update immediately from the dropdown.
    if (inquiryStatusNeedsPopup(nextStatus, data.inquiryStatuses || [])) {
      setStatusError('');
      setStatusModal({ inquiry, target: nextStatus });
      return;
    }

    if (inquiry.status === 'Order Won') {
      const projectWarning = inquiry.project_created && ['Order Lost', 'Inquiry Hold'].includes(nextStatus)
        ? '\n\nThe linked project will be locked until this inquiry is restored to Order Won.'
        : '';
      setStatusConfirm({inquiry,nextStatus,message:`Are you sure you want to change the status from Order Won to ${nextStatus}?${projectWarning}`});
      return;
    }
    await applySimpleStatusChange(inquiry,nextStatus);
  };

  const openStatusDetails = async (row) => {
    if (!row?.id) return;
    setStatusDetails({ row, history: null });
    setStatusDetailsLoading(true);
    setStatusDetailsError('');
    try {
      const history = await api(`/inquiries/${row.id}/status-history`);
      const matching = (history || []).find((item) => item.to_status === row.status) || (history || [])[0] || null;
      setStatusDetails({ row, history: matching });
    } catch (error) {
      setStatusDetailsError(error.message || 'Unable to load status details.');
    } finally {
      setStatusDetailsLoading(false);
    }
  };

  const enrichedRows = useMemo(() => (data.inquiries || []).map((row) => {
    const customer = (data.customers || []).find((item) => item.id === row.customer_id);
    const primaryContact = (customer?.contacts || []).find((item) => item.is_primary) || customer?.contacts?.[0];
    const creator = (data.users || []).find((item) => item.id === row.created_by_id);
    const panelTypes = uniq((row.panel_instances || row.panels || []).map((panel) => panel.panel_type || panel.panel || panel.panel_code));
    const linkedProject = (data.projects || []).find((project) => project.inquiry_id === row.id || project.source_inquiry === row.inquiry_no);
    const projectCreated = !!linkedProject || !!row.project_created;
    return {
      ...row,
      customer_name: row.customer || customer?.customer_name || '',
      created_by_name: row.created_by || row.created_by_name || creator?.full_name || '—',
      mobile: primaryContact?.phone || '—',
      panel_types: panelTypes,
      kickoff_meeting: row.kickoff_meeting || null,
      project_created: projectCreated,
      project_id: row.project_id || linkedProject?.id || null,
      project_no: row.project_no || linkedProject?.project_no || '',
      revision_number: row.revision_number ?? row.current_revision_number ?? null,
      revision_label: row.revision_label || row.current_revision_label || '',
      fy: financialYearLabel(row.inquiry_date || row.created_at),
    };
  }), [data.inquiries, data.customers, data.projects, data.users]);

  const configuredStatuses = useMemo(() => {
    const configured=(data.inquiryStatuses || []).filter((item)=>item.is_active !== false).sort((a,b)=>(a.display_order||0)-(b.display_order||0)).map((item)=>item.status_name);
    return configured.length ? configured : INQUIRY_STATUSES;
  }, [data.inquiryStatuses]);
  const statusOptions = useMemo(() => uniq([...configuredStatuses, ...enrichedRows.map((row) => row.status)]), [configuredStatuses, enrichedRows]);
  const panelOptions = useMemo(() => uniq(enrichedRows.flatMap((row) => row.panel_types)), [enrichedRows]);
  const createdByOptions = useMemo(() => uniq(enrichedRows.map((row) => row.created_by_name).filter((name) => name && name !== '—')), [enrichedRows]);
  const fyOptions = useMemo(() => uniq([financialYearLabel(new Date()), ...enrichedRows.map((row) => row.fy)]).sort().reverse(), [enrichedRows]);

  const rows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (!matchesSearch([row.inquiry_no, row.customer_name, row.project_name, row.mobile, row.created_by_name, row.panel_types, row.status], q)) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (panelFilter && !row.panel_types.includes(panelFilter)) return false;
      if (createdByFilter && row.created_by_name !== createdByFilter) return false;
      if (fyFilter && row.fy !== fyFilter) return false;
      return true;
    });
  }, [enrichedRows, q, statusFilter, panelFilter, createdByFilter, fyFilter]);

  useEffect(() => { setPage(1); }, [q, statusFilter, panelFilter, createdByFilter, fyFilter, pageSize]);

  const pageSizeOptions = [25, 50, 100];
  const effectivePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 25;
  const pageCount = rows.length ? Math.ceil(rows.length / effectivePageSize) : 0;
  const safePage = pageCount ? Math.min(Math.max(1, page), pageCount) : 0;
  const pageStart = safePage ? (safePage - 1) * effectivePageSize : 0;
  const visibleRows = rows.slice(pageStart, pageStart + effectivePageSize);

  const goToSection = (key) => {
    setActiveNav(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openAddCustomer = () => {
    try {
      sessionStorage.setItem('nexus-inquiry-create-draft', JSON.stringify({ core, generalValues, panelEntries }));
    } catch (_) {
      // Draft persistence is a convenience only; navigation can continue without it.
    }
    navigate(`/customers/new?returnTo=${encodeURIComponent('/inquiries/new')}`);
  };

  const resetForm = () => {
    setCore({ customer_id: '', project_name: '', inquiry_date: '', timeline_weeks: '', order_expected_end_date: '', actual_end_date: '', status: 'New' });
    setCoreErrors({});
    setGeneralValues({});
    setGeneralErrors({});
    setPanelEntries([emptyPanelEntry(0)]);
    setPanelErrors({});
    setPanelMessage('');
  };

  const updatePanelEntry = (idx, patch) => setPanelEntries((prev) => prev.map((entry, i) => i === idx ? { ...entry, ...patch } : entry));
  const updatePanelData = (idx, fieldId, value) => setPanelEntries((prev) => prev.map((entry, i) => i === idx ? { ...entry, panel_data: { ...entry.panel_data, [fieldId]: value } } : entry));
  const updatePanelQty = (idx, value) => setPanelEntries((prev) => prev.map((entry, i) => {
    if (i !== idx) return entry;
    const qty = cleanQty(value);
    if (qty === 1) return { ...entry, qty, details_mode: 'common', separate_grids: [] };
    return { ...entry, qty, separate_grids: entry.details_mode === 'separate' ? normalizeSeparateGrids(entry, qty, Math.min(2, qty)) : [] };
  }));
  const setPanelMode = (idx, mode) => setPanelEntries((prev) => prev.map((entry, i) => {
    if (i !== idx) return entry;
    const qty = cleanQty(entry.qty);
    if (qty <= 1 || mode === 'common') return { ...entry, details_mode: 'common', separate_grids: [] };
    return { ...entry, details_mode: 'separate', separate_grids: normalizeSeparateGrids(entry, qty, Math.min(2, qty)) };
  }));
  const updateSeparatePanelData = (idx, gridIdx, fieldId, value) => setPanelEntries((prev) => prev.map((entry, i) => i !== idx ? entry : {
    ...entry,
    separate_grids: (entry.separate_grids || []).map((grid, g) => g === gridIdx ? { ...grid, panel_data: { ...grid.panel_data, [fieldId]: value } } : grid),
  }));
  const updateSeparateGridQty = (idx, gridIdx, value) => setPanelEntries((prev) => prev.map((entry, i) => i !== idx ? entry : {
    ...entry,
    separate_grids: rebalanceSeparateQty(entry.separate_grids || [], gridIdx, value, entry.qty),
  }));
  const addSeparateGrid = (idx) => setPanelEntries((prev) => prev.map((entry, i) => {
    if (i !== idx) return entry;
    const qty = cleanQty(entry.qty);
    const grids = [...(entry.separate_grids || [])];
    if (grids.length >= qty) return entry;
    let splitIndex = -1;
    for (let g = grids.length - 1; g >= 0; g -= 1) if ((grids[g].group_qty || 1) > 1) { splitIndex = g; break; }
    if (splitIndex < 0) return entry;
    grids[splitIndex] = { ...grids[splitIndex], group_qty: grids[splitIndex].group_qty - 1 };
    grids.push(makeSeparateGrid(grids.length, {}, 1));
    return { ...entry, separate_grids: grids.map((grid, index) => ({ ...grid, unit_no:index + 1 })) };
  }));
  const removeSeparateGrid = (idx, gridIdx) => setPanelEntries((prev) => prev.map((entry, i) => {
    if (i !== idx) return entry;
    const grids = [...(entry.separate_grids || [])];
    if (grids.length <= 2) return entry;
    const removed = grids.splice(gridIdx, 1)[0];
    const mergeIndex = Math.max(0, gridIdx - 1);
    grids[mergeIndex] = { ...grids[mergeIndex], group_qty:(grids[mergeIndex].group_qty || 1) + (removed?.group_qty || 1) };
    return { ...entry, separate_grids: grids.map((grid, index) => ({ ...grid, unit_no:index + 1 })) };
  }));
  const addPanelEntry = () => setPanelEntries((prev) => [...prev, emptyPanelEntry(prev.length)]);
  const removePanelEntry = (idx) => setPanelEntries((prev) => prev.filter((_, i) => i !== idx));

  const submit = async (event) => {
    event.preventDefault();
    const nextCoreErrors = {};
    if (!core.customer_id) nextCoreErrors.customer_id = 'Customer is required.';
    if (!core.project_name.trim()) nextCoreErrors.project_name = 'Project Name is required.';
    if (!core.inquiry_date) nextCoreErrors.start_date = 'Start Date is required.';
    if (!Number.isFinite(Number(core.timeline_weeks)) || Number(core.timeline_weeks) <= 0) nextCoreErrors.timeline_weeks = 'Enter a positive timeline, for example 0.5 or 2 weeks.';
    setCoreErrors(nextCoreErrors);
    if (Object.keys(nextCoreErrors).length) { goToSection('inquiry'); return; }

    const generalValidation = validateDynamicForm(masterSections, generalValues);
    setGeneralErrors(generalValidation.errors);
    if (!generalValidation.isValid) { goToSection('inquiry'); return; }

    const selectedEntries = panelEntries.filter((entry) => entry.panel_master_id);
    if (!selectedEntries.length) {
      setPanelMessage('Select at least one panel.');
      goToSection('panels');
      return;
    }

    const allPanelErrors = {};
    let validPanels = true;
    selectedEntries.forEach((entry) => {
      const originalIndex = panelEntries.indexOf(entry);
      const panel = activePanels.find((item) => item.id === entry.panel_master_id);
      const version = panel?.versions?.find((v) => v.is_active);
      const qty = cleanQty(entry.qty);
      const mode = qty > 1 ? (entry.details_mode || 'common') : 'common';
      if (mode === 'separate') {
        const grids = entry.separate_grids || [];
        const gridErrors = {};
        const allocated = allocatedQty(grids);
        if (grids.length < 2 || allocated !== qty) {
          validPanels = false;
          allPanelErrors[originalIndex] = { _gridCount: `Separate forms must allocate exactly ${qty} qty. Currently allocated: ${allocated}.`, _grids: gridErrors };
          return;
        }
        grids.forEach((grid, gridIndex) => {
          const validation = validateDynamicForm(version?.sections || [], grid.panel_data || {});
          if (!validation.isValid) {
            validPanels = false;
            gridErrors[gridIndex] = validation.errors;
          }
        });
        if (Object.keys(gridErrors).length) allPanelErrors[originalIndex] = { _grids: gridErrors };
      } else {
        const validation = validateDynamicForm(version?.sections || [], entry.panel_data);
        if (!validation.isValid) {
          validPanels = false;
          allPanelErrors[originalIndex] = validation.errors;
        }
      }
    });
    setPanelErrors(allPanelErrors);
    setPanelMessage('');
    if (!validPanels) { goToSection('panels'); return; }

    const dynamicDocumentDrafts = [
      ...collectDynamicDocumentDrafts(masterSections, generalValues),
      ...selectedEntries.flatMap((entry) => {
        const panel = activePanels.find((item) => item.id === entry.panel_master_id);
        const version = panel?.versions?.find((v) => v.is_active);
        if (!version?.sections?.length) return [];
        if (cleanQty(entry.qty) > 1 && entry.details_mode === 'separate') {
          return (entry.separate_grids || []).flatMap((grid) => collectDynamicDocumentDrafts(version.sections, grid.panel_data || {}));
        }
        return collectDynamicDocumentDrafts(version.sections, entry.panel_data || {});
      }),
    ];

    const customer = activeCustomers.find((item) => item.id === core.customer_id);
    const panelInstances = selectedEntries.map((entry) => {
      const panel = activePanels.find((item) => item.id === entry.panel_master_id);
      const version = panel?.versions?.find((v) => v.is_active);
      return {
        panel_master_id: entry.panel_master_id,
        panel_id: entry.panel_master_id,
        panel_no: entry.panel_no.trim() || 'P-01',
        qty: cleanQty(entry.qty),
        details_mode: cleanQty(entry.qty) > 1 ? (entry.details_mode || 'common') : 'common',
        panel_type: panel?.panel_type || '',
        panel: panel?.panel_type || '',
        panel_code: panel?.panel_code || '',
        panel_version_id: version?.id || null,
        panel_data: sanitizeDynamicDocumentValues(entry.panel_data),
        separate_grids: (entry.details_mode === 'separate' ? (entry.separate_grids || []) : []).map((grid, gridIndex) => ({ ...grid, unit_no: gridIndex + 1, group_qty: Math.max(1, Number.parseInt(grid.group_qty, 10) || 1), panel_data: sanitizeDynamicDocumentValues(grid.panel_data || {}) })),
      };
    });

    const payload = {
      inquiry_no: `INQ-${String((data.inquiries?.length || 0) + 1).padStart(4, '0')}`,
      customer_id: core.customer_id,
      customer: customer?.customer_name || '',
      project_name: core.project_name.trim(),
      inquiry_date: core.inquiry_date,
      timeline_weeks: Number(core.timeline_weeks),
      order_expected_end_date: core.order_expected_end_date || addTimelineWeeks(core.inquiry_date, core.timeline_weeks),
      expected_end_date: core.order_expected_end_date || addTimelineWeeks(core.inquiry_date, core.timeline_weeks),
      actual_end_date: core.actual_end_date || '',
      status: 'New',
      created_at: new Date().toISOString().slice(0, 10),
      master_version_id: activeMasterVersion?.id || null,
      general_data: sanitizeDynamicDocumentValues(generalValues),
      panel_instances: panelInstances,
      panels: panelInstances.map((panel) => ({ panel_id: panel.panel_master_id, panel_no: panel.panel_no, panel: panel.panel_type, qty: panel.qty })),
    };

    try {
      const created = await api('/inquiries', { method:'POST', body:JSON.stringify(payload) });
      if (dynamicDocumentDrafts.length) await uploadDynamicDocumentDrafts(api, 'inquiry', created.id, dynamicDocumentDrafts);
      await refresh();
      try { sessionStorage.removeItem('nexus-inquiry-create-draft'); } catch (_) {}
      resetForm();
      navigate('/inquiries');
    } catch (error) {
      setPanelMessage(error.message || 'Unable to create inquiry or upload document.');
      goToSection('inquiry');
    }
  };

  if (createMode) {
    return (
      <div className="fade-in mx-auto max-w-[1550px] pb-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <button type="button" onClick={() => navigate('/inquiries')} className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"><ArrowLeft size={16} /> Back</button>
            <div className="mt-1"><h1 className="text-xl font-bold text-slate-900 sm:text-2xl">New Inquiry</h1><p className="text-xs text-slate-500 sm:text-sm">Customer + general inquiry + panel-specific fields in one page.</p></div>
          </div>
          {activeMasterVersion && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Inquiry Master v{activeMasterVersion.version_no}</span>}
        </div>

        {!activeMasterVersion && <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"><AlertCircle size={16} /><span>No active Inquiry Master. <a href="/masters/inquiry" className="font-semibold underline">Configure it here →</a></span></div>}

        <div className="sticky top-0 z-20 mb-3 -mx-3 border-b border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5 xl:-mx-6 xl:px-6">
          <StepNav steps={[{ key: 'inquiry', label: 'Inquiry Information' }, { key: 'panels', label: 'Panel Details' }]} active={activeNav} onSelect={goToSection} />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div ref={(el) => (sectionRefs.current.inquiry = el)} className="scroll-mt-20">
            <SectionCard number="1" icon={FileText} color="blue" title="Inquiry Information" subtitle="Core inquiry details plus fields configured in Inquiry Master." className="!rounded-xl">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-2"><Field label="Customer" required>
                  <div className="flex min-w-0 gap-2">
                    <Select value={core.customer_id} onChange={(e) => setCore((prev) => ({ ...prev, customer_id: e.target.value }))} className={`min-w-0 flex-1 ${coreErrors.customer_id ? '!border-rose-400' : ''}`}>
                      <option value="">Select customer</option>
                      {activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name}</option>)}
                    </Select>
                    <SecondaryButton type="button" onClick={openAddCustomer} className="shrink-0 !px-3 !py-2"><Plus size={14} /> Add New Customer</SecondaryButton>
                  </div>
                  {coreErrors.customer_id && <p className="mt-1 text-xs text-rose-600">{coreErrors.customer_id}</p>}
                </Field></div>
                <Field label="Project Name" required><Input value={core.project_name} onChange={(e) => setCore((prev) => ({ ...prev, project_name: e.target.value }))} placeholder="Enter project name" className={coreErrors.project_name ? '!border-rose-400' : ''} />{coreErrors.project_name && <p className="mt-1 text-xs text-rose-600">{coreErrors.project_name}</p>}</Field>
                <Field label="Status"><Input value="New" readOnly className="bg-slate-50 text-slate-500" /></Field>
              </div>

              <FixedTimelineFields
                value={{ start_date: core.inquiry_date, timeline_weeks: core.timeline_weeks, expected_end_date: core.order_expected_end_date, actual_end_date: core.actual_end_date }}
                onChange={(schedule) => setCore((prev) => ({ ...prev, inquiry_date: schedule.start_date, timeline_weeks: schedule.timeline_weeks, order_expected_end_date: schedule.expected_end_date, actual_end_date: schedule.actual_end_date }))}
                errors={coreErrors}
              />

              {masterSections.length > 0 ? <div className="mt-4 border-t border-slate-100 pt-4"><DynamicForm embedded sections={masterSections} values={generalValues} onChange={(fieldId, value) => setGeneralValues((prev) => ({ ...prev, [fieldId]: value }))} errors={generalErrors} /></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 py-7 text-center text-xs text-slate-400">No additional Inquiry Master fields configured.</div>}
            </SectionCard>
          </div>

          <div ref={(el) => (sectionRefs.current.panels = el)} className="scroll-mt-20">
            <SectionCard
              number="2"
              icon={PanelsTopLeft}
              color="indigo"
              title="Panel Details"
              subtitle="Select panel types; their fields load immediately from Panel Master."
              headerAction={<SecondaryButton type="button" onClick={addPanelEntry} className="!px-2.5 !py-1.5 !text-xs"><Plus size={13} /> Add Panel</SecondaryButton>}
              className="!rounded-xl"
            >
              {panelMessage && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{panelMessage}</div>}
              <div className="space-y-3">
                {panelEntries.map((entry, idx) => {
                  const selectedPanel = activePanels.find((panel) => panel.id === entry.panel_master_id);
                  const version = selectedPanel?.versions?.find((v) => v.is_active);
                  return (
                    <div key={entry._key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[120px_minmax(0,1fr)_100px_40px]">
                        <Field label="Panel No."><Input value={entry.panel_no} onChange={(e) => updatePanelEntry(idx, { panel_no: e.target.value })} className="!py-2" /></Field>
                        <Field label="Panel Type" required><Select value={entry.panel_master_id} onChange={(e) => updatePanelEntry(idx, { panel_master_id: e.target.value, panel_data: {}, details_mode: 'common', separate_grids: [] })} className="!py-2"><option value="">Select panel</option>{activePanels.map((panel) => <option key={panel.id} value={panel.id}>{panel.panel_code} · {panel.panel_type}</option>)}</Select></Field>
                        <Field label="Qty"><Input type="number" min="1" value={entry.qty} onChange={(e) => updatePanelQty(idx, e.target.value)} className="!py-2" /></Field>
                        <div className="flex items-end"><button type="button" disabled={panelEntries.length === 1} onClick={() => removePanelEntry(idx)} className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" title="Remove panel"><Trash2 size={15} /></button></div>
                      </div>
                      {selectedPanel && <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">{selectedPanel.panel_code} · v{version?.version_no}</span>{cleanQty(entry.qty) > 1 && <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"><button type="button" onClick={() => setPanelMode(idx, 'common')} className={`rounded-md px-3 py-1 text-xs font-semibold transition ${entry.details_mode !== 'separate' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Common</button><button type="button" onClick={() => setPanelMode(idx, 'separate')} className={`rounded-md px-3 py-1 text-xs font-semibold transition ${entry.details_mode === 'separate' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>Separate</button></div>}</div>}
                      {panelErrors[idx]?._gridCount && <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{panelErrors[idx]._gridCount}</div>}
                      {version?.sections?.length ? (cleanQty(entry.qty) > 1 && entry.details_mode === 'separate' ? <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] text-indigo-700"><span>Each form can cover one or more identical panels.</span><span className="font-bold">Allocated {allocatedQty(entry.separate_grids || [])} / {cleanQty(entry.qty)}</span></div>
                        {(entry.separate_grids || []).map((grid, gridIdx) => <div key={grid._key || gridIdx} className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm">
                          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <div><p className="text-xs font-bold text-slate-800">{entry.panel_no || 'Panel'} · Separate Form {gridIdx + 1}</p><p className="text-[10px] text-slate-400">These details apply to the quantity entered for this form.</p></div>
                            <div className="flex items-end gap-2"><div className="w-24"><Field label="Qty"><Input type="number" min="1" max={cleanQty(entry.qty)} value={grid.group_qty || 1} onChange={(e) => updateSeparateGridQty(idx, gridIdx, e.target.value)} className="!py-1.5" /></Field></div>{(entry.separate_grids || []).length > 2 && <button type="button" onClick={() => removeSeparateGrid(idx, gridIdx)} className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove separate form"><Trash2 size={13}/></button>}</div>
                          </div>
                          <DynamicForm embedded sections={version.sections} values={grid.panel_data || {}} onChange={(fieldId, value) => updateSeparatePanelData(idx, gridIdx, fieldId, value)} errors={panelErrors[idx]?._grids?.[gridIdx] || {}} />
                        </div>)}
                        {(entry.separate_grids || []).length < cleanQty(entry.qty) && (entry.separate_grids || []).some((grid) => (grid.group_qty || 1) > 1) && <div className="flex justify-center pt-1"><SecondaryButton type="button" onClick={() => addSeparateGrid(idx)} className="!border-indigo-200 !bg-indigo-50 !px-3 !py-2 !text-xs !font-semibold !text-indigo-700 hover:!bg-indigo-100"><Plus size={13} /> Add Separate Form</SecondaryButton></div>}
                      </div> : <div><div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">{cleanQty(entry.qty) > 1 ? `Common details apply to all ${cleanQty(entry.qty)} panels.` : 'Panel-specific details.'}</div><DynamicForm embedded sections={version.sections} values={entry.panel_data} onChange={(fieldId, value) => updatePanelData(idx, fieldId, value)} errors={panelErrors[idx] || {}} /></div>) : selectedPanel ? <div className="rounded-lg border border-dashed border-slate-300 py-5 text-center text-xs text-slate-400">No active fields for this panel.</div> : null}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="sticky bottom-0 z-20 -mx-3 flex justify-end gap-2 border-t border-slate-200 bg-slate-100/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5 xl:-mx-6 xl:px-6">
            <SecondaryButton type="button" onClick={() => navigate('/inquiries')} className="!py-2">Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={!activeMasterVersion} className="!py-2"><ClipboardCheck size={15} /> Create Inquiry</PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader title="All Inquiries" description="Manage inquiries, panels and status workflow." action={canCreate ? <PrimaryButton onClick={() => navigate('/inquiries/new')}><Plus size={16} /> New Inquiry</PrimaryButton> : null} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="min-w-[250px] flex-1 sm:max-w-[320px]"><SearchBox value={q} onChange={setQ} placeholder="Search Inquiry ID, customer or project..." /></div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto !min-w-[160px]"><option value="">All Statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</Select>
          <Select value={panelFilter} onChange={(e) => setPanelFilter(e.target.value)} className="!w-auto !min-w-[155px]"><option value="">All Panel Types</option>{panelOptions.map((panel) => <option key={panel} value={panel}>{panel}</option>)}</Select>
          <Select value={createdByFilter} onChange={(e) => setCreatedByFilter(e.target.value)} className="!w-auto !min-w-[150px]"><option value="">All Created By</option>{createdByOptions.map((name) => <option key={name} value={name}>{name}</option>)}</Select>
          <Select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} className="!w-auto !min-w-[115px]"><option value="">All FY</option>{fyOptions.map((fy) => <option key={fy} value={fy}>{fy}</option>)}</Select>
          <button type="button" title="Refresh" onClick={refresh} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><RefreshCw size={16} /></button>
        </div>

        {statusError && <div className="mx-3 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{statusError}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Sr. No.</th>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Customer Name</th>
                <th className="px-4 py-3 text-left">Project Name</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created By</th>
                <th className="px-4 py-3 text-left">Panel Type</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-12 text-center text-slate-400">No records found</td></tr>
              ) : visibleRows.map((row, rowIndex) => (
                <tr key={row.id} onClick={(event) => { if (event.target.closest('button,a,input,select,textarea,label')) return; navigate(`/inquiries/${row.id}/view`); }} className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 ${row.amendment ? 'border-l-4 border-l-amber-400 bg-amber-50/30' : ''}`}>
                  <td className="px-4 py-3 text-slate-600">{pageStart + rowIndex + 1}</td>
                  <td className="px-4 py-3"><button type="button" onClick={() => navigate(`/inquiries/${row.id}/view`)} className="font-semibold text-blue-700 hover:underline">{row.inquiry_no}</button></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(row.inquiry_date || row.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.customer_name || '—'}</td>
                  <td className="max-w-[220px] px-4 py-3 text-slate-700"><span className="line-clamp-2">{row.project_name || '—'}</span></td>
                  <td className="px-4 py-3">
                    <Select
                      value={row.status}
                      disabled={!canChangeStatus || row.can_change_status === false || statusChangingId === row.id}
                      onChange={(e) => handleStatusChange(row, e.target.value)}
                      className={`!min-w-[170px] !py-1.5 !text-xs !font-semibold ${statusTone(row.status)}`}
                    >
                      {uniq([...configuredStatuses, row.status]).map((status) => <option key={status} value={status}>{status}</option>)}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-slate-700"><span className="inline-flex items-center gap-1.5">{row.created_by_name || '—'}{row.created_by_id === data.currentUser?.id && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">(You)</span>}</span></td>
                  <td className="px-4 py-3"><div className="flex max-w-[180px] flex-wrap gap-1">{row.panel_types.length ? row.panel_types.map((panel) => <span key={panel} className="rounded bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">{panel}</span>) : <span>—</span>}</div></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {row.revision_number !== null && row.revision_number !== undefined && <span className="whitespace-nowrap rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">Revision {row.revision_number}</span>}
                      {row.amendment && <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">Amendment</span>}
                      {row.project_created ? (
                        <button type="button" onClick={() => row.project_id && navigate(`/projects/${row.project_id}/view`)} className="whitespace-nowrap rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100">Project Created{row.project_no ? ` · ${row.project_no}` : ''}</button>
                      ) : canUseKickoff && row.can_kickoff !== false && row.status === 'Order Won' && row.kickoff_meeting ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setKickoffModal({ inquiry:row, editing:false })}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${kickoffIsDue(row.kickoff_meeting) ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                          >
                            {kickoffIsDue(row.kickoff_meeting) ? <CheckCircle2 size={10}/> : <CalendarClock size={10}/>}
                            {kickoffIsDue(row.kickoff_meeting) ? 'Kickoff Meeting Done' : 'Kick-off Scheduled'}
                          </button>
                        </>
                      ) : null}
                      {row.status !== 'Order Won' && inquiryStatusNeedsPopup(row.status, data.inquiryStatuses || []) && (
                        <button
                          type="button"
                          onClick={() => openStatusDetails(row)}
                          className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition ${statusActionTone(row.status)}`}
                          title={`View ${row.status} details`}
                        >
                          {row.status}
                        </button>
                      )}
                      <button type="button" onClick={() => downloadInquiryPdf(row)} disabled={pdfDownloadingId === row.id} title="Download Inquiry PDF" className="rounded-md p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"><Download size={13} /></button>
                      {canUpdate && row.can_edit !== false && <button type="button" onClick={() => navigate(`/inquiries/${row.id}/edit`)} title="Edit Inquiry" className="rounded-md p-1 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"><Pencil size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">Show per page:<Select data-draft-ignore="true" value={effectivePageSize} onChange={(e) => { const next=Number(e.target.value); if(pageSizeOptions.includes(next))setPageSize(next); }} className="!w-auto !py-1.5">{pageSizeOptions.map((size)=><option key={size} value={size}>{size}</option>)}</Select></div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-500 disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 font-semibold text-blue-700">Page {safePage} of {pageCount}</span>
            <button type="button" disabled={!pageCount || safePage >= pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-500 disabled:opacity-40">Next <ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {statusDetails && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setStatusDetails(null); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{statusDetails.row.status}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{statusDetails.row.inquiry_no} · {statusDetails.row.project_name || statusDetails.row.customer_name || 'Inquiry'}</p>
              </div>
              <button type="button" onClick={() => setStatusDetails(null)} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">Close</button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {statusDetailsLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading status details...</div>
              ) : statusDetailsError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{statusDetailsError}</div>
              ) : (() => {
                const item = statusDetails.history;
                const dynamicFields = Array.isArray(item?.dynamic_fields) ? item.dynamic_fields : [];
                const dynamicValues = item?.dynamic_values && typeof item.dynamic_values === 'object' ? item.dynamic_values : {};
                const rows = [
                  ['Reason', item?.reason],
                  ['Additional Remark', item?.additional_remark],
                  ['Customer Comment', item?.customer_comment],
                  ['Internal Notes', item?.internal_notes],
                  ['Remarks', item?.remarks],
                  ['Revision', item?.version_label || (item?.revision_number !== null && item?.revision_number !== undefined ? `Revision ${item.revision_number}` : '')],
                ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

                const kickoff = statusDetails.row.status === 'Order Won' ? statusDetails.row.kickoff_meeting : null;
                const hasKickoff = kickoff && (kickoff.meeting_date || kickoff.start_time || kickoff.end_time || kickoff.agenda || kickoff.location);
                const hasDynamic = dynamicFields.some((field) => {
                  const key = field.field_key || field.key || field.id || field.label;
                  const value = dynamicValues[key];
                  return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length);
                });
                const hasDocuments = Array.isArray(item?.documents) && item.documents.length > 0;

                if (!item && !hasKickoff) return <div className="py-8 text-center text-sm text-slate-500">No popup values were recorded for this status.</div>;

                return (
                  <div className="space-y-4">
                    {rows.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {rows.map(([label, value]) => (
                          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasDynamic && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Popup Fields</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {dynamicFields.map((field, index) => {
                            const key = field.field_key || field.key || field.id || field.label;
                            const value = dynamicValues[key];
                            if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return null;
                            return (
                              <div key={key || index} className="rounded-lg bg-slate-50 px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label || field.field_name || key}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {hasKickoff && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kickoff Meeting</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            ['Date', kickoff.meeting_date ? formatDate(kickoff.meeting_date) : ''],
                            ['Start Time', kickoff.start_time],
                            ['End Time', kickoff.end_time],
                            ['Location', kickoff.location],
                            ['Agenda', kickoff.agenda],
                          ].filter(([, value]) => value).map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasDocuments && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
                        <div className="space-y-2">
                          {item.documents.map((document) => (
                            <div key={document.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                              <span className="font-medium text-slate-800">{document.original_file_name || 'Document'}</span>
                              <span className="text-xs text-slate-500">{document.document_type || document.role || ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {item?.changed_by && (
                      <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">Saved by {item.changed_by}{item.changed_at ? ` · ${new Date(item.changed_at).toLocaleString('en-GB')}` : ''}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {canChangeStatus && statusModal && <InquiryStatusModal inquiry={statusModal.inquiry} initialStatus={statusModal.target} onClose={() => setStatusModal(null)} onChanged={async () => { setStatusModal(null); await refresh(); }} />}
      <ConfirmDialog open={!!statusConfirm} title="Change Order Won status?" message={statusConfirm?.message||''} confirmLabel="Change Status" danger onCancel={()=>{setStatusConfirm(null);setClockTick((value)=>value+1);}} onConfirm={()=>{const pending=statusConfirm;setStatusConfirm(null);if(pending)applySimpleStatusChange(pending.inquiry,pending.nextStatus);}}/>
      {canUseKickoff && kickoffModal && (
        <KickoffWorkflowModal
          inquiry={kickoffModal.inquiry}
          meeting={kickoffModal.inquiry.kickoff_meeting}
          startEditing={kickoffModal.editing}
          onClose={() => setKickoffModal(null)}
          onChanged={refresh}
          onProjectCreated={(result) => { if (result?.project_id) navigate(`/projects/${result.project_id}/${canUpdateProject ? 'edit' : 'view'}`); }}
        />
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, FileText } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { emptyMeetingDraft, MeetingFields } from './MeetingSections';
import { ConfirmDialog, Field, Input, Modal, PrimaryButton, SecondaryButton, Select, Textarea } from './ui';

export const INQUIRY_STATUSES = [
  'New',
  'Technical Evaluation',
  'Technical BoM Submitted',
  'BoM Approval Pending',
  'Revision',
  'Commercial BOM Submission',
  'Order Won',
  'Order Lost',
  'Inquiry Hold',
];

const ORDER_LOST_REASONS = ['Price', 'Commercial', 'Priority', 'Timing', 'Trust Issue', 'Certification'];
const HOLD_REASONS = ['Due to Customer', 'Specification', 'Technical', 'Commercial'];
const BOM_STATUSES = ['Technical BoM Submitted', 'Revision', 'Commercial BOM Submission', 'Order Won'];

const minutesFromTime = (value) => {
  if (!value) return null;
  const [hh, mm] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return (hh * 60) + mm;
};

export const INQUIRY_STATUS_POPUP_STATUSES = [
  'Technical BoM Submitted',
  'BoM Approval Pending',
  'Revision',
  'Commercial BOM Submission',
  'Order Won',
  'Order Lost',
  'Inquiry Hold',
];

export const inquiryStatusNeedsPopup = (status, statusConfigs = []) => {
  if (INQUIRY_STATUS_POPUP_STATUSES.includes(status)) return true;
  return !!statusConfigs.find((item) => item.status_name === status && item.is_active !== false && item.requires_popup);
};

const filesFrom = (event) => Array.from(event.target.files || []).slice(0, 10);

function FileNames({ files = [] }) {
  if (!files.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{files.map((file, index) => <span key={`${file.name}-${index}`} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{file.name}</span>)}</div>;
}

const normalizeDocName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const defaultBomSubtypeId = (documentTypes = [], status = '') => {
  const active = (documentTypes || []).filter((item) => item.is_active !== false);
  const roots = active.filter((item) => !item.parent_document_type_id);
  const bomRoots = roots.filter((item) => {
    const token = normalizeDocName(`${item.document_type_code || ''} ${item.document_type_name || ''}`);
    return token.includes('bom') || token.includes('billofmaterial');
  });
  const wanted = status === 'Commercial BOM Submission' ? 'commercial' : 'technical';
  const child = active.find((item) => {
    if (!bomRoots.some(root=>root.id===item.parent_document_type_id)) return false;
    const token = normalizeDocName(`${item.document_type_code || ''} ${item.document_type_name || ''}`);
    if (wanted === 'technical' && (token.includes('nontechnical') || token.includes('nontech'))) return false;
    return token.includes(wanted);
  });
  return child?.id || '';
};

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const kb = size / 1024;
  return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
};

export default function InquiryStatusModal({ inquiry, initialStatus = '', onClose, onChanged }) {
  const { data, refresh } = useStore();
  const [toStatus, setToStatus] = useState(initialStatus || inquiry?.status || 'New');
  const [orderLostReason, setOrderLostReason] = useState('');
  const [orderLostAdditionalRemark, setOrderLostAdditionalRemark] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdAdditionalRemark, setHoldAdditionalRemark] = useState('');
  const [bomApprovalAdditionalRemark, setBomApprovalAdditionalRemark] = useState('');
  const [revisionCustomerComment, setRevisionCustomerComment] = useState('');
  const [revisionInternalNotes, setRevisionInternalNotes] = useState('');
  const [bomSubmissionRemarks, setBomSubmissionRemarks] = useState('');
  const [genericReason, setGenericReason] = useState('');
  const [genericRemark, setGenericRemark] = useState('');
  const [dynamicValues, setDynamicValues] = useState({});

  const [bomDocumentTypeId, setBomDocumentTypeId] = useState('');
  const [bomDocumentName, setBomDocumentName] = useState('');
  const [bomFiles, setBomFiles] = useState([]);

  const [kickoff, setKickoff] = useState(emptyMeetingDraft);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusConfirmOpen,setStatusConfirmOpen]=useState(false);
  const confirmationAccepted=useRef(false);
  const formRef=useRef(null);

  useEffect(() => {
    setToStatus(initialStatus || inquiry?.status || 'New');
    setOrderLostReason('');
    setOrderLostAdditionalRemark('');
    setHoldReason('');
    setHoldAdditionalRemark('');
    setBomApprovalAdditionalRemark('');
    setRevisionCustomerComment('');
    setRevisionInternalNotes('');
    setBomSubmissionRemarks('');
    setGenericReason('');
    setGenericRemark('');
    setDynamicValues({});
    setBomDocumentTypeId('');
    setBomDocumentName('');
    setBomFiles([]);
    setKickoff(emptyMeetingDraft());
    setErrors({});
    setServerError('');
  }, [inquiry?.id, initialStatus]);

  useEffect(() => {
    if (!BOM_STATUSES.includes(toStatus)) {
      setBomDocumentTypeId('');
      setBomDocumentName('');
      setBomFiles([]);
      return;
    }
    const defaultId = defaultBomSubtypeId(data.documentTypes || [], toStatus);
    setBomDocumentTypeId(defaultId || '');
  }, [toStatus, data.documentTypes]);

  const showBomUpload = useMemo(() => BOM_STATUSES.includes(toStatus), [toStatus]);
  const oldStyleReasonPopup = ['Order Lost', 'Inquiry Hold'].includes(toStatus);
  const statusOptions = useMemo(() => {
    const configured=(data.inquiryStatuses || []).filter((item)=>item.is_active !== false).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
    const all=configured.length ? configured.map((item)=>item.status_name) : INQUIRY_STATUSES;
    return all;
  }, [data.inquiryStatuses, inquiry?.project_created, inquiry?.status]);
  const currentStatusConfig = (data.inquiryStatuses || []).find((item)=>item.status_name===toStatus);
  const genericReasonPopup = !!currentStatusConfig?.requires_popup && !INQUIRY_STATUS_POPUP_STATUSES.includes(toStatus);
  const dynamicPopupFields = Array.isArray(currentStatusConfig?.popup_fields) ? currentStatusConfig.popup_fields : [];
  // Master-added popup fields are additive. They can be used on custom statuses
  // and also on built-in reason statuses such as Order Lost / Inquiry Hold.
  const showDynamicPopupFields = dynamicPopupFields.length > 0 && !!currentStatusConfig?.requires_popup;
  const configuredReasonOptions = Array.isArray(currentStatusConfig?.reason_options)
    ? currentStatusConfig.reason_options.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const orderLostReasonOptions = toStatus === 'Order Lost' && configuredReasonOptions.length ? configuredReasonOptions : ORDER_LOST_REASONS;
  const holdReasonOptions = toStatus === 'Inquiry Hold' && configuredReasonOptions.length ? configuredReasonOptions : HOLD_REASONS;
  if (!inquiry) return null;

  const validate = () => {
    const next = {};
    if (!toStatus) next.to_status = 'Choose a status.';
    if (toStatus === inquiry.status) next.to_status = 'Choose a different status.';
    // The select only exposes valid master-configured values, so the client only
    // needs to make sure a value was actually selected. The backend performs the
    // canonical reason validation as the source of truth.
    if (toStatus === 'Order Lost' && !String(orderLostReason || '').trim()) next.order_lost_reason = 'Select the Order Lost reason.';
    if (toStatus === 'Inquiry Hold' && !String(holdReason || '').trim()) next.hold_reason = 'Select the Inquiry Hold reason.';
    if (genericReasonPopup && (currentStatusConfig?.reason_options || []).length && !genericReason) next.generic_reason = `Select a reason for ${toStatus}.`;
    dynamicPopupFields.forEach((field) => {
      const value = dynamicValues[field.key];
      const missing = Array.isArray(value) ? value.length === 0 : value === undefined || value === null || String(value).trim() === '';
      if (field.required && missing) next[`dynamic_${field.key}`] = `${field.label} is required.`;
    });
    if (['Technical BoM Submitted', 'Revision', 'Commercial BOM Submission'].includes(toStatus) && !bomFiles.length) next.bom_files = `${toStatus === 'Commercial BOM Submission' ? 'Commercial' : 'Technical'} BOM Document is required.`;
    if (bomFiles.length && !bomDocumentTypeId) next.bom_type = `Choose the ${toStatus === 'Commercial BOM Submission' ? 'Commercial' : 'Technical'} BOM document subtype.`;
    if (bomFiles.length && !bomDocumentName.trim()) next.bom_name = 'Enter a document name.';

    if (toStatus === 'Order Won') {
      const meeting = {};
      if (!kickoff.meeting_date) meeting.meeting_date = 'Kickoff date is required.';
      if (!kickoff.start_time) meeting.start_time = 'Kickoff start time is required.';
      if (!kickoff.end_time) meeting.end_time = 'Kickoff end time is required.';
      const startMinutes = minutesFromTime(kickoff.start_time);
      const endMinutes = minutesFromTime(kickoff.end_time);
      if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) meeting.end_time = 'End time must be later than start time.';
      if (!(kickoff.user_ids || []).length) meeting.user_ids = 'Assign at least one user.';
      if (Object.keys(meeting).length) next.kickoff = meeting;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    if (inquiry.status === 'Order Won' && toStatus !== 'Order Won' && !confirmationAccepted.current) {
      setStatusConfirmOpen(true);
      return;
    }
    confirmationAccepted.current=false;

    const payload = {
      to_status: toStatus,
      order_lost_reason: String(orderLostReason || '').trim(),
      order_lost_additional_remark: orderLostAdditionalRemark.trim(),
      hold_reason: String(holdReason || '').trim(),
      hold_additional_remark: holdAdditionalRemark.trim(),
      bom_approval_additional_remark: bomApprovalAdditionalRemark.trim(),
      revision_customer_comment: revisionCustomerComment.trim(),
      revision_internal_notes: revisionInternalNotes.trim(),
      bom_submission_remarks: bomSubmissionRemarks.trim(),
      generic_reason: String(genericReason || '').trim(),
      generic_remark: genericRemark.trim(),
      // Compatibility aliases used by older status handlers. The dedicated
      // fields above remain the primary source, so existing functionality is
      // unchanged.
      reason: toStatus === 'Order Lost'
        ? String(orderLostReason || '').trim()
        : toStatus === 'Inquiry Hold'
          ? String(holdReason || '').trim()
          : String(genericReason || '').trim(),
      additional_remark: toStatus === 'Order Lost'
        ? orderLostAdditionalRemark.trim()
        : toStatus === 'Inquiry Hold'
          ? holdAdditionalRemark.trim()
          : genericRemark.trim(),
      dynamic_values: dynamicValues,
      kickoff_meeting: toStatus === 'Order Won' ? kickoff : undefined,
    };

    // Reason-only/status-only changes do not need multipart/form-data. Sending
    // JSON avoids losing fields in the multipart path and keeps Order Lost /
    // Inquiry Hold reliable. We still use FormData whenever a BOM file exists.
    let body;
    if (bomFiles.length) {
      body = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined) return;
        body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      });
      body.append('bomAttachments', bomFiles[0]);
      body.append('bom_document_type_id', bomDocumentTypeId);
      body.append('bom_document_name', bomDocumentName.trim() || bomFiles[0]?.name || '');
    } else {
      body = JSON.stringify(payload);
    }

    setSaving(true);
    setServerError('');
    try {
      await api(`/inquiries/${inquiry.id}/status`, { method: 'POST', body });
      await refresh();
      if (onChanged) await onChanged();
      onClose();
    } catch (error) {
      setServerError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const statusConfirmMessage=`Are you sure you want to change the status from Order Won to ${toStatus}?${inquiry.project_created && ['Order Lost','Inquiry Hold'].includes(toStatus)?'\n\nThe linked project will be locked until this inquiry is restored to Order Won.':''}`;

  return <>
    <Modal title={oldStyleReasonPopup ? toStatus : `Change Status · ${inquiry.inquiry_no}`} onClose={onClose} wide={toStatus === 'Order Won' || toStatus === 'Revision'}>
      <form ref={formRef} onSubmit={submit} className="space-y-4">
        {inquiry.status === 'Order Won' && toStatus !== 'Order Won' && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div><p className="font-bold">Order Won status will be changed</p><p className="mt-0.5 text-xs">{['Order Lost', 'Inquiry Hold'].includes(toStatus) ? 'The linked project will be locked until the inquiry returns to Order Won.' : `The inquiry status will change to ${toStatus}.`}</p></div>
          </div>
        )}
        {oldStyleReasonPopup ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-700">{inquiry.project_name || inquiry.customer || 'Inquiry'}</p>
            <p className="mt-0.5 text-xs text-slate-500">Inquiry: {inquiry.inquiry_no}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current Status"><Input value={inquiry.status || 'New'} readOnly className="bg-slate-50 text-slate-500" /></Field>
            <Field label="Change To" required>
              <Select value={toStatus} onChange={(e) => { setToStatus(e.target.value); setErrors({}); setServerError(''); setDynamicValues({}); }}>
                <option value="">Select status</option>
                {statusOptions.filter((status) => status !== inquiry.status).map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
              {errors.to_status && <p className="mt-1 text-xs text-rose-600">{errors.to_status}</p>}
            </Field>
          </div>
        )}

        {toStatus === 'Order Lost' && (
          <div className="space-y-3">
            <Field label="Reason for Order Lost" required>
              <Select value={orderLostReason} onChange={(e) => { setOrderLostReason(e.target.value); setErrors((current)=>({...current,order_lost_reason:''})); setServerError(''); }}>
                <option value="">Select reason</option>
                {orderLostReasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </Select>
              {errors.order_lost_reason && <p className="mt-1 text-xs text-rose-600">{errors.order_lost_reason}</p>}
            </Field>
            <Field label="Additional Remark"><Textarea rows={3} value={orderLostAdditionalRemark} onChange={(e) => setOrderLostAdditionalRemark(e.target.value)} placeholder="Optional additional remark" /></Field>
          </div>
        )}

        {toStatus === 'Inquiry Hold' && (
          <div className="space-y-3">
            <Field label="Hold Reason" required>
              <Select value={holdReason} onChange={(e) => { setHoldReason(e.target.value); setErrors((current)=>({...current,hold_reason:''})); setServerError(''); }}>
                <option value="">Select hold reason</option>
                {holdReasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </Select>
              {errors.hold_reason && <p className="mt-1 text-xs text-rose-600">{errors.hold_reason}</p>}
            </Field>
            <Field label="Additional Remark"><Textarea rows={3} value={holdAdditionalRemark} onChange={(e) => setHoldAdditionalRemark(e.target.value)} placeholder="Optional additional remark" /></Field>
          </div>
        )}

        {toStatus === 'BoM Approval Pending' && (
          <Field label="BoM Approval Additional Remark"><Textarea rows={3} value={bomApprovalAdditionalRemark} onChange={(e) => setBomApprovalAdditionalRemark(e.target.value)} placeholder="Approval / review remark" /></Field>
        )}

        {toStatus === 'Revision' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Comment"><Textarea rows={4} value={revisionCustomerComment} onChange={(e) => setRevisionCustomerComment(e.target.value)} placeholder="Customer revision comment" /></Field>
            <Field label="Internal Notes"><Textarea rows={4} value={revisionInternalNotes} onChange={(e) => setRevisionInternalNotes(e.target.value)} placeholder="Internal revision notes" /></Field>
          </div>
        )}

        {toStatus === 'Technical BoM Submitted' && (
          <Field label="BoM Submission Remarks"><Textarea rows={3} value={bomSubmissionRemarks} onChange={(e) => setBomSubmissionRemarks(e.target.value)} placeholder="BoM submission remarks" /></Field>
        )}

        {genericReasonPopup && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {(currentStatusConfig?.reason_options || []).length > 0 && (
              <Field label={`Reason for ${toStatus}`} required>
                <Select value={genericReason} onChange={(e)=>{setGenericReason(e.target.value);setErrors((current)=>({...current,generic_reason:''}));setServerError('');}}>
                  <option value="">Select reason</option>
                  {(currentStatusConfig.reason_options || []).map((reason)=><option key={reason} value={reason}>{reason}</option>)}
                </Select>
                {errors.generic_reason && <p className="mt-1 text-xs text-rose-600">{errors.generic_reason}</p>}
              </Field>
            )}
            <Field label="Additional Remark"><Textarea rows={3} value={genericRemark} onChange={(e)=>setGenericRemark(e.target.value)} placeholder="Optional remark" /></Field>
          </div>
        )}

        {showDynamicPopupFields && (
          <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Additional Details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {dynamicPopupFields.map((field) => {
                const value = dynamicValues[field.key] ?? (field.type === 'checkbox' ? [] : '');
                const update = (nextValue) => { setDynamicValues((current)=>({...current,[field.key]:nextValue})); setErrors((current)=>({...current,[`dynamic_${field.key}`]:''})); setServerError(''); };
                const err = errors[`dynamic_${field.key}`];
                return <div key={field.key} className={field.type === 'textarea' || field.type === 'checkbox' || field.type === 'radio' ? 'sm:col-span-2' : ''}>
                  <Field label={field.label} required={!!field.required}>
                    {field.type === 'textarea' ? <Textarea rows={3} value={value} onChange={(e)=>update(e.target.value)} />
                    : field.type === 'number' ? <Input type="number" value={value} onChange={(e)=>update(e.target.value)} />
                    : field.type === 'date' ? <Input type="date" value={value} onChange={(e)=>update(e.target.value)} />
                    : field.type === 'dropdown' ? <Select value={value} onChange={(e)=>update(e.target.value)}><option value="">Select {field.label}</option>{(field.options||[]).map((option)=><option key={option} value={option}>{option}</option>)}</Select>
                    : field.type === 'radio' ? <div className="flex flex-wrap gap-2">{(field.options||[]).map((option)=><label key={option} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><input type="radio" name={`status-${field.key}`} checked={value===option} onChange={()=>update(option)}/>{option}</label>)}</div>
                    : field.type === 'checkbox' ? <div className="flex flex-wrap gap-2">{(field.options||[]).map((option)=>{const checked=Array.isArray(value)&&value.includes(option);return <label key={option} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={()=>update(checked?value.filter((item)=>item!==option):[...(Array.isArray(value)?value:[]),option])}/>{option}</label>;})}</div>
                    : <Input value={value} onChange={(e)=>update(e.target.value)} />}
                    {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
                  </Field>
                </div>;
              })}
            </div>
          </div>
        )}

        {showBomUpload && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="mb-3 flex items-start gap-2">
              <FileText size={16} className="mt-0.5 text-indigo-600"/>
              <div>
                <p className="text-sm font-semibold text-slate-800">{toStatus === 'Order Won' ? 'Final Technical BoM' : toStatus === 'Commercial BOM Submission' ? 'Commercial BOM Document' : 'Technical BoM Document'}</p>
                <p className="text-xs text-slate-500">
                  {toStatus === 'Order Won'
                    ? 'Optional final Technical BoM for the kick-off workflow.'
                    : toStatus === 'Commercial BOM Submission'
                    ? 'Required for this status. Commercial BOM document type is selected automatically.'
                    : 'Required for this status. Technical BOM document type is selected automatically; revision numbering is automatic.'}
                </p>
              </div>
            </div>
            <Field label="Document Type / Subtype"><Input value={bomDocumentTypeId ? `BOM / ${(data.documentTypes||[]).find(item=>item.id===bomDocumentTypeId)?.document_type_name || 'BOM'}` : 'BOM subtype is missing'} readOnly className="bg-slate-100 text-slate-700" /></Field>
            {!bomDocumentTypeId&&<p className="mt-1 text-xs text-rose-700">Add the Technical and Commercial BOM subtypes under BOM in Document Type Master, or run database script 13.</p>}
            {errors.bom_type&&<p className="mt-1 text-xs text-rose-700">{errors.bom_type}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Document Name" required={toStatus !== 'Order Won' || bomFiles.length > 0}>
                <Input value={bomDocumentName} onChange={(e) => setBomDocumentName(e.target.value)} placeholder={toStatus === 'Commercial BOM Submission' ? 'e.g. Commercial BOM Rev 1' : 'e.g. Technical BOM Rev 1'} />
                {errors.bom_name && <p className="mt-1 text-xs text-rose-600">{errors.bom_name}</p>}
              </Field>
              <Field label={toStatus === 'Order Won' ? 'Final Technical BoM File' : toStatus === 'Commercial BOM Submission' ? 'Commercial BOM File' : 'Technical BoM File'} required={toStatus !== 'Order Won'}>
                <Input type="file" onChange={(e) => { const files=Array.from(e.target.files || []).slice(0, 1); setBomFiles(files); if(files[0]) setBomDocumentName((current)=>current || files[0].name); }} />
                <FileNames files={bomFiles} />
                {bomFiles[0] && <p className="mt-1 text-[11px] text-slate-400">File size: {formatFileSize(bomFiles[0].size)}</p>}
                {errors.bom_files && <p className="mt-1 text-xs text-rose-600">{errors.bom_files}</p>}
              </Field>
            </div>
          </div>
        )}

        {toStatus === 'Order Won' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
            <div className="mb-3 flex items-start gap-2"><CalendarClock size={17} className="mt-0.5 text-blue-600"/><div><p className="text-sm font-semibold text-slate-900">Kick-off Meeting</p><p className="text-xs text-slate-500">Enter the meeting date/time, attendees and meeting link. This schedules the kick-off; it does not create the project immediately.</p></div></div>
            <MeetingFields value={kickoff} onChange={setKickoff} users={data.users || []} errors={errors.kickoff || {}} requireAgenda={false} requireEndTime />
          </div>
        )}

        {serverError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{serverError}</div>}
        <div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving...' : oldStyleReasonPopup ? 'Save' : 'Update Status'}</PrimaryButton></div>
      </form>
    </Modal>
    <ConfirmDialog open={statusConfirmOpen} title="Change Order Won status?" message={statusConfirmMessage} confirmLabel="Change Status" danger onCancel={()=>setStatusConfirmOpen(false)} onConfirm={()=>{confirmationAccepted.current=true;setStatusConfirmOpen(false);queueMicrotask(()=>formRef.current?.requestSubmit());}}/>
  </>;
}

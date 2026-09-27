import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Plus, UsersRound, X } from 'lucide-react';
import { api } from '../api';
import { Field, Input, PrimaryButton, SecondaryButton, Textarea } from './ui';

export const emptyMeetingDraft = () => ({
  title: '',
  meeting_date: '',
  start_time: '',
  end_time: '',
  agenda: '',
  location: '',
  meeting_link: '',
  user_ids: [],
});

const meetingTime = (value) => {
  if (!value) return '';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5);
  return date.toISOString().slice(11, 16);
};

const meetingDate = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};

export const meetingToDraft = (meeting) => ({
  title: meeting?.title || '',
  meeting_date: meetingDate(meeting?.meeting_date),
  start_time: meetingTime(meeting?.start_time),
  end_time: meetingTime(meeting?.end_time),
  agenda: meeting?.agenda || '',
  location: meeting?.location || '',
  meeting_link: meeting?.meeting_link || '',
  user_ids: (meeting?.user_ids || meeting?.attendees?.map((item) => item.id) || []).filter(Boolean),
});

function UserPicker({ users = [], selected = [], onChange, error }) {
  const activeUsers = useMemo(() => users.filter((user) => user.is_active !== false), [users]);
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700"><UsersRound size={14} /> Assigned Users <span className="text-rose-500">*</span></div>
      <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-3">
        {activeUsers.length === 0 && <p className="col-span-full px-2 py-3 text-xs text-slate-400">No active users available.</p>}
        {activeUsers.map((user) => {
          const checked = selected.includes(user.id);
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => toggle(user.id)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition ${checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check size={11} />}</span>
              <span className="min-w-0"><span className="block truncate">{user.full_name}</span><span className="block truncate text-[10px] font-normal text-slate-400">{user.role || user.role_code || 'User'}</span></span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function MeetingFields({ value, onChange, users = [], errors = {}, showTitle = false, titleLabel = 'Meeting Title', requireEndTime = false }) {
  const set = (key, nextValue) => onChange({ ...value, [key]: nextValue });
  return (
    <div className="space-y-3">
      {showTitle && <Field label={titleLabel} required><Input value={value.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Weekly Project Review" />{errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}</Field>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date" required><Input type="date" value={value.meeting_date || ''} onChange={(e) => set('meeting_date', e.target.value)} />{errors.meeting_date && <p className="mt-1 text-xs text-rose-600">{errors.meeting_date}</p>}</Field>
        <Field label="Start Time" required><Input type="time" value={value.start_time || ''} onChange={(e) => set('start_time', e.target.value)} />{errors.start_time && <p className="mt-1 text-xs text-rose-600">{errors.start_time}</p>}</Field>
        <Field label="End Time" required={requireEndTime}><Input type="time" value={value.end_time || ''} onChange={(e) => set('end_time', e.target.value)} />{errors.end_time && <p className="mt-1 text-xs text-rose-600">{errors.end_time}</p>}</Field>
        <Field label="Location"><Input value={value.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="Meeting room / online" /></Field>
      </div>
      <Field label="Meeting Link"><Input value={value.meeting_link || ''} onChange={(e) => set('meeting_link', e.target.value)} placeholder="https://..." /></Field>
      <Field label="Agenda" required><Textarea rows={3} value={value.agenda || ''} onChange={(e) => set('agenda', e.target.value)} placeholder="What will be discussed?" />{errors.agenda && <p className="mt-1 text-xs text-rose-600">{errors.agenda}</p>}</Field>
      <UserPicker users={users} selected={value.user_ids || []} onChange={(ids) => set('user_ids', ids)} error={errors.user_ids} />
    </div>
  );
}

function MeetingCard({ meeting }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{meeting.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{meeting.meeting_date} · {meeting.start_time}{meeting.end_time ? `–${meeting.end_time}` : ''}{meeting.location ? ` · ${meeting.location}` : ''}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">{meeting.status || 'Scheduled'}</span>
      </div>
      {meeting.agenda && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-700">Agenda:</span> {meeting.agenda}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(meeting.attendees || []).map((user) => <span key={user.id} className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">{user.full_name}</span>)}
        {(meeting.attendees || []).length === 0 && <span className="text-xs text-slate-400">No users assigned.</span>}
      </div>
    </div>
  );
}

export function InquiryKickoffSummary({ inquiryId }) {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api(`/meetings?inquiry_id=${encodeURIComponent(inquiryId)}`)
      .then((rows) => live && setMeetings((rows || []).filter((item) => item.meeting_type === 'KICKOFF')))
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [inquiryId]);

  if (error) return <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Unable to load kickoff meeting: {error}</section>;
  if (!meetings.length) return <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-bold text-amber-800">Kickoff Meeting</p><p className="mt-1 text-xs text-amber-700">Order is won, but a kickoff meeting has not been scheduled yet. Open Edit to schedule it.</p></section>;

  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="mb-2 flex items-center gap-2"><CalendarClock size={16} className="text-blue-600"/><h3 className="text-sm font-bold text-slate-900">Kickoff Meeting</h3></div><MeetingCard meeting={meetings[0]} /></section>;
}

const validateProjectMeeting = (draft) => {
  const errors = {};
  if (!String(draft.title || '').trim()) errors.title = 'Meeting title is required.';
  if (!draft.meeting_date) errors.meeting_date = 'Date is required.';
  if (!draft.start_time) errors.start_time = 'Start time is required.';
  if (!String(draft.agenda || '').trim()) errors.agenda = 'Agenda is required.';
  if (!(draft.user_ids || []).length) errors.user_ids = 'Assign at least one user.';
  return errors;
};

export function ProjectMeetings({ projectId, projectNo = '', users = [], onChanged, readOnly = false }) {
  const [meetings, setMeetings] = useState([]);
  const [draft, setDraft] = useState(emptyMeetingDraft);
  const [showCreate, setShowCreate] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api(`/meetings?project_id=${encodeURIComponent(projectId)}`);
      setMeetings((rows || []).filter((item) => item.meeting_type === 'PROJECT'));
      setError('');
    } catch (err) { setError(err.message); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const createMeeting = async () => {
    const validation = validateProjectMeeting(draft);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setSaving(true);
    try {
      await api('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          title: draft.title.trim(),
          agenda: draft.agenda.trim(),
          meeting_type: 'PROJECT',
          project_id: projectId,
        }),
      });
      setDraft(emptyMeetingDraft());
      setShowCreate(false);
      await load();
      if (onChanged) await onChanged();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock size={16} className="text-blue-600"/>Project Meetings</h3><p className="mt-0.5 text-xs text-slate-400">Schedule meetings, set the agenda and assign users{projectNo ? ` for ${projectNo}` : ''}.</p></div>
        {!readOnly && <SecondaryButton type="button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? <X size={14}/> : <Plus size={14}/>} {showCreate ? 'Close' : 'Add Meeting'}</SecondaryButton>}
      </div>
      {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      {!readOnly && showCreate && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3"><MeetingFields value={draft} onChange={setDraft} users={users} errors={errors} showTitle/><div className="mt-3 flex justify-end"><PrimaryButton type="button" disabled={saving} onClick={createMeeting}>{saving ? 'Creating...' : 'Create Meeting'}</PrimaryButton></div></div>}
      <div className="mt-3 space-y-2">
        {meetings.length ? meetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting}/>) : <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">No project meetings scheduled yet.</div>}
      </div>
    </section>
  );
}

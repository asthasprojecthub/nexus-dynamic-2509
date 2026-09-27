import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ExternalLink, Pencil, UsersRound } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { MeetingFields, meetingToDraft } from './MeetingSections';
import { ConfirmDialog, Modal, PrimaryButton, SecondaryButton } from './ui';

const completionAt = (meeting) => {
  if (!meeting?.meeting_date || !meeting?.start_time || !meeting?.end_time) return null;
  const completionTime = meeting.end_time;
  const [y, m, d] = String(meeting.meeting_date).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(completionTime).slice(0, 5).split(':').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const kickoffIsDue = (meeting) => {
  const date = completionAt(meeting);
  return !!date && Date.now() >= date.getTime();
};

const formatScheduled = (meeting) => {
  const date = completionAt(meeting);
  if (!date) return 'Scheduled time unavailable';
  return `${date.toLocaleDateString('en-GB')} · ${String(meeting.start_time || '').slice(0, 5)}${meeting.end_time ? `–${String(meeting.end_time).slice(0, 5)}` : ''}`;
};

const validate = (draft) => {
  const errors = {};
  if (!draft.meeting_date) errors.meeting_date = 'Kick-off date is required.';
  if (!draft.start_time) errors.start_time = 'Start time is required.';
  if (!draft.end_time) errors.end_time = 'End time is required.';
  if (draft.start_time && draft.end_time && String(draft.end_time).slice(0, 5) <= String(draft.start_time).slice(0, 5)) errors.end_time = 'End time must be later than start time.';
  if (!(draft.user_ids || []).length) errors.user_ids = 'Assign at least one user.';
  return errors;
};

export default function KickoffWorkflowModal({ inquiry, meeting, onClose, onChanged, onProjectCreated, startEditing = false }) {
  const { data, refresh } = useStore();
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(() => meetingToDraft(meeting));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const due = useMemo(() => kickoffIsDue(meeting), [meeting, clockTick]);
  const attendees = useMemo(() => meeting?.attendees || [], [meeting]);

  useEffect(() => {
    // Re-evaluate the completion state while the modal is open so the
    // "Kickoff Meeting Done" action appears automatically after End Time.
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, []);


  const save = async () => {
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setServerError('');
    try {
      await api(`/inquiries/${inquiry.id}/kickoff`, {
        method: 'PUT',
        body: JSON.stringify({ ...draft, agenda: String(draft.agenda || '').trim() }),
      });
      await refresh();
      if (onChanged) await onChanged();
      onClose();
    } catch (error) {
      setServerError(error.message || 'Unable to update the kick-off meeting.');
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    setCompleteConfirmOpen(false);
    setSaving(true);
    setServerError('');
    try {
      const result = await api(`/inquiries/${inquiry.id}/kickoff/complete`, { method: 'POST', body: JSON.stringify({}) });
      await refresh();
      if (onChanged) await onChanged();
      onClose();
      if (onProjectCreated) onProjectCreated(result);
    } catch (error) {
      setServerError(error.message || 'Unable to complete the kick-off meeting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal title={`Kick-off Meeting · ${inquiry.inquiry_no}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{inquiry.project_name || inquiry.customer || 'Inquiry'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatScheduled(meeting)}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${due ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {due ? 'Ready For Completion' : 'Kick-off Scheduled'}
            </span>
          </div>
        </div>

        {editing ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <MeetingFields value={draft} onChange={setDraft} users={data.users || []} errors={errors} requireEndTime />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><CalendarClock size={14}/>Meeting Details</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{formatScheduled(meeting)}</p>
              {meeting?.location && <p className="mt-1 text-xs text-slate-500">Location: {meeting.location}</p>}
              {meeting?.meeting_link && <a href={meeting.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><ExternalLink size={12}/>Open meeting link</a>}
              {meeting?.agenda && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600"><span className="font-semibold">Agenda:</span> {meeting.agenda}</p>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><UsersRound size={14}/>Assigned Users</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attendees.length ? attendees.map((user) => <span key={user.id} className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">{user.full_name}</span>) : <span className="text-xs text-slate-400">No assigned users.</span>}
              </div>
            </div>
          </div>
        )}

        {serverError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{serverError}</div>}

        <div className="flex flex-wrap justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          {editing ? (
            <PrimaryButton type="button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Kick-off'}</PrimaryButton>
          ) : (
            <>
              <SecondaryButton type="button" onClick={() => setEditing(true)}><Pencil size={14}/> Edit Kick-off</SecondaryButton>
              {due && <PrimaryButton type="button" disabled={saving} onClick={() => setCompleteConfirmOpen(true)}><CheckCircle2 size={14}/> {saving ? 'Creating Project...' : 'Kickoff Meeting Done'}</PrimaryButton>}
            </>
          )}
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={completeConfirmOpen}
      title="Complete Kick-off Meeting?"
      message="The Kick-off Meeting will be marked as done and the Project will be created."
      confirmLabel="Complete and Create Project"
      onConfirm={complete}
      onCancel={() => setCompleteConfirmOpen(false)}
    />
    </>
  );
}

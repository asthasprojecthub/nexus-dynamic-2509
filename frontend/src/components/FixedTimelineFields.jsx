import React from 'react';
import { CalendarDays, LockKeyhole } from 'lucide-react';
import { Field, Input } from './ui';

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const addTimelineWeeks = (startDate, weeks) => {
  if (!startDate) return '';
  const count = Number(weeks);
  if (!Number.isFinite(count) || count <= 0) return '';
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Math.ceil(count * 7));
  return date.toISOString().slice(0, 10);
};

export const timelineWeeksFromDates = (startDate, expectedEndDate) => {
  if (!startDate || !expectedEndDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${expectedEndDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return '';
  return Math.round(((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100) / 100;
};

export function normalizeFixedTimeline(value = {}, fallbackStart = '') {
  const startDate = value.start_date || value.inquiry_date || fallbackStart || '';
  const storedExpected = value.expected_end_date || value.order_expected_end_date || value.target_end_date || '';
  const timelineWeeks = value.timeline_weeks || timelineWeeksFromDates(startDate, storedExpected) || '';
  return {
    start_date: startDate,
    timeline_weeks: timelineWeeks,
    expected_end_date: storedExpected || (timelineWeeks ? addTimelineWeeks(startDate, timelineWeeks) : ''),
    actual_end_date: value.actual_end_date || '',
  };
}

export default function FixedTimelineFields({ value = {}, onChange, readOnly = false, errors = {} }) {
  const schedule = normalizeFixedTimeline(value, value.start_date || value.inquiry_date || '');
  const updateTimeline = (raw) => {
    if (!onChange) return;
    const numeric = Number(raw);
    const cleaned = raw === '' ? '' : raw;
    onChange({
      ...schedule,
      timeline_weeks: cleaned,
      expected_end_date: cleaned && Number.isFinite(numeric) && numeric > 0 ? addTimelineWeeks(schedule.start_date, numeric) : '',
    });
  };
  const updateStart = (startDate) => {
    if (!onChange) return;
    onChange({
      ...schedule,
      start_date: startDate,
      expected_end_date: schedule.timeline_weeks ? addTimelineWeeks(startDate, schedule.timeline_weeks) : '',
    });
  };
  const updateActual = (actual) => {
    if (!onChange) return;
    onChange({ ...schedule, actual_end_date: actual });
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Start Date" required>
          <Input type="date" value={schedule.start_date} disabled={readOnly} onChange={(event) => updateStart(event.target.value)} className={errors.start_date ? '!border-rose-400' : ''} title="Select the start date" />
          {errors.start_date && <p className="mt-1 text-xs text-rose-600">{errors.start_date}</p>}
        </Field>
        <Field label="Timeline (Weeks)" required>
          <Input type="number" min="0.01" step="0.1" value={schedule.timeline_weeks} disabled={readOnly} onChange={(event) => updateTimeline(event.target.value)} placeholder="e.g. 0.5 or 2" className={errors.timeline_weeks ? '!border-rose-400' : ''} />
          {errors.timeline_weeks && <p className="mt-1 text-xs text-rose-600">{errors.timeline_weeks}</p>}
        </Field>
        <Field label="Expected End Date" required>
          <Input type="date" value={schedule.expected_end_date} disabled className="!bg-slate-100 !text-slate-600" title="Automatically calculated from Start Date + Timeline (Weeks)" />
        </Field>
        <Field label="Actual End Date">
          <Input type="date" value={schedule.actual_end_date} disabled={readOnly} onChange={(event) => updateActual(event.target.value)} />
        </Field>
      </div>
    </div>
  );
}

export function FixedTimelineMasterFields() {
  const fields = [
    ['Start Date', 'Manual · Required'],
    ['Timeline (Weeks)', 'Manual · Positive decimal weeks'],
    ['Expected End Date', 'Auto · Start Date + Timeline'],
    ['Actual End Date', 'Manual · Optional'],
  ];
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><CalendarDays size={16} /></div>
        <div><h3 className="text-sm font-bold text-slate-900">Fixed Timeline Fields</h3><p className="text-xs text-slate-500">System-defined for every Inquiry and Project. These fields cannot be deleted, renamed, reordered or converted to another field type.</p></div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {fields.map(([label, rule]) => <div key={label} className="rounded-lg border border-blue-100 bg-white px-3 py-2.5"><div className="flex items-center gap-1.5"><LockKeyhole size={12} className="text-blue-600"/><p className="text-xs font-bold text-slate-800">{label}</p></div><p className="mt-1 text-[11px] text-slate-500">{rule}</p></div>)}
      </div>
    </section>
  );
}

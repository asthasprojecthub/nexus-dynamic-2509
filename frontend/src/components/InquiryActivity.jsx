import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, FileText, RefreshCcw } from 'lucide-react';
import { api } from '../api';
import { Status } from './ui';

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const revisionNumberFrom = (activity) => {
  const value = activity?.new_values?.revision_number;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const detailPieces = (activity) => {
  const next = activity?.new_values || {};
  return [
    next.reason && `Reason: ${next.reason}`,
    next.additional_remark && `Remark: ${next.additional_remark}`,
    next.customer_comment && `Customer: ${next.customer_comment}`,
    next.internal_notes && `Internal: ${next.internal_notes}`,
    next.remarks && `BoM: ${next.remarks}`,
  ].filter(Boolean);
};

export default function InquiryActivity({ inquiry, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!inquiry?.id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api(`/inquiries/${encodeURIComponent(inquiry.id)}/activity`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [inquiry?.id, refreshKey]);

  const currentRevision = useMemo(() => {
    const direct = inquiry?.revision_number ?? inquiry?.current_revision_number;
    if (direct !== null && direct !== undefined && direct !== '') return Number(direct);
    for (const row of rows) {
      const revision = revisionNumberFrom(row);
      if (revision !== null) return revision;
    }
    return null;
  }, [inquiry, rows]);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Activity</h3>
            <p className="text-xs text-slate-400">Inquiry updates, status movement and revision activity.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentRevision !== null && Number.isFinite(currentRevision) && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200">
              Revision {currentRevision}
            </span>
          )}
          <button type="button" onClick={load} disabled={loading} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-700 disabled:opacity-40" title="Refresh activity">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-3 text-xs text-rose-600">{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-400">No activity recorded yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const oldStatus = row.old_values?.status;
            const newStatus = row.new_values?.status;
            const revisionNumber = revisionNumberFrom(row);
            const details = detailPieces(row);
            return (
              <div key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    {row.action === 'CREATE' ? 'Inquiry Created' : row.action === 'STATUS_CHANGE' ? 'Status Changed' : row.action === 'UPDATE' ? 'Inquiry Updated' : row.action.replaceAll('_', ' ')}
                  </span>
                  {oldStatus && newStatus && (
                    <div className="flex items-center gap-1.5"><Status value={oldStatus}/><ArrowRight size={12} className="text-slate-400"/><Status value={newStatus}/></div>
                  )}
                  {revisionNumber !== null && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Revision {revisionNumber}</span>
                  )}
                  {(row.new_values?.document_ids || []).length > 0 && <FileText size={13} className="text-slate-400" />}
                  <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">{formatDateTime(row.created_at)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>By <b className="text-slate-700">{row.user || 'System'}</b></span>
                  {details.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

import React, { useEffect, useState } from 'react';
import { ArrowRight, History } from 'lucide-react';
import { api } from '../api';
import { Status } from './ui';

const Detail = ({ label, value }) => value ? <span><b className="text-slate-700">{label}:</b> {value}</span> : null;

export default function InquiryStatusHistory({ inquiryId, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api(`/inquiries/${encodeURIComponent(inquiryId)}/status-history`)
      .then((data) => { if (live) { setRows(data || []); setError(''); } })
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [inquiryId, refreshKey]);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><History size={16} className="text-blue-600"/><div><h3 className="text-sm font-bold text-slate-900">Status History</h3><p className="text-xs text-slate-400">Status-specific details are retained against each change.</p></div></div>
      {error ? <div className="px-4 py-3 text-xs text-rose-600">Unable to load status history: {error}</div> : rows.length === 0 ? <div className="px-4 py-6 text-center text-xs text-slate-400">No status changes recorded yet.</div> : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            return (
              <div key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs"><Status value={row.from_status}/><ArrowRight size={13} className="text-slate-400"/><Status value={row.to_status}/>{row.version_label && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{row.version_label}</span>}<span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">{row.changed_at}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>By <b className="text-slate-700">{row.changed_by}</b></span>
                  <Detail label="Reason" value={row.reason} />
                  <Detail label="Additional Remark" value={row.additional_remark} />
                  <Detail label="Customer Comment" value={row.customer_comment} />
                  <Detail label="Internal Notes" value={row.internal_notes} />
                  <Detail label="BoM Remarks" value={row.remarks} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

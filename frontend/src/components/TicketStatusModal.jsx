import React, { useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import {
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Textarea,
} from "./ui";
import TicketDynamicFields, { ticketFieldVisible } from "./TicketDynamicFields";

export default function TicketStatusModal({ ticket, onClose, onChanged }) {
  const { data, refresh } = useStore();
  const current = (data.ticketWorkflows || []).find(
    (item) => item.id === ticket.current_status_id,
  );
  const allowedCodes = current?.allowed_next_status_codes || [];
  const choices = useMemo(
    () =>
      (data.ticketWorkflows || []).filter(
        (item) =>
          item.is_active !== false &&
          item.id !== ticket.current_status_id &&
          (!allowedCodes.length || allowedCodes.includes(item.status_code)),
      ),
    [data.ticketWorkflows, ticket.current_status_id, allowedCodes.join("|")],
  );
  const [statusId, setStatusId] = useState(choices[0]?.id || "");
  const [values, setValues] = useState({});
  const [files, setFiles] = useState({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const status = choices.find((item) => item.id === statusId);
  const submit = async () => {
    if (!status) return setError("Choose the next status.");
    for (const field of status.dynamic_fields || []) {
      if (field.required && ticketFieldVisible(field, values)) {
        const value = values[field.key];
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && !value.length)
        )
          return setError(`${field.label} is required.`);
      }
    }
    const body = new FormData();
    body.append("status_id", status.id);
    body.append("response_data", JSON.stringify(values));
    body.append("note", note);
    Object.values(files)
      .flat()
      .slice(0, 10)
      .forEach((file) => body.append("statusAttachments", file));
    setSaving(true);
    setError("");
    try {
      await api(`/tickets/${ticket.id}/status`, { method: "POST", body });
      await refresh();
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Change status · ${ticket.ticket_no}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Next Status" required>
          <Select
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setValues({});
              setFiles({});
            }}
          >
            <option value="">Select status</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.status_name}
              </option>
            ))}
          </Select>
        </Field>
        {status && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">
                {status.status_name}
              </p>
              <span
                className="rounded-full px-2 py-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: status.color }}
              >
                {status.sla_days} day SLA
              </span>
            </div>
            <TicketDynamicFields
              fields={status.dynamic_fields}
              values={values}
              onChange={setValues}
              data={data}
              ticketFormVersionId={ticket.ticket_form_version_id}
              onFilesChange={(key, next) =>
                setFiles((old) => ({ ...old, [key]: next }))
              }
            />
          </div>
        )}
        <Field label="Additional Note">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={saving || !statusId}
            onClick={submit}
          >
            {saving ? "Updating…" : "Update Status"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

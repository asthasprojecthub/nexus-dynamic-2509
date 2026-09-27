import React, { useState } from "react";
import { LockKeyhole, Plus, Settings2, X } from "lucide-react";
import { Input, Modal, PrimaryButton, SecondaryButton } from "./ui";
import {
  mergeTicketFormSections,
  ticketCoreOptions,
  ticketDynamicSections,
  TICKET_CORE_OPTION_DEFINITIONS,
} from "../utils/ticketFormOptions";

const fields = [
  { label: "Customer" },
  { label: "Subject" },
  { label: "Ticket Type", category: "TICKET_TYPE" },
  { label: "Problem Type", category: "PROBLEM_TYPE" },
  { label: "Manufacturer", category: "MANUFACTURER" },
  { label: "Model Number" },
  { label: "Received Through", category: "RECEIVED_VIA" },
  { label: "Warranty", category: "WARRANTY_STATUS" },
  { label: "Support Location", category: "SUPPORT_MODE" },
  { label: "Support Type", category: "SUPPORT_TYPE" },
  { label: "Repair Location", category: "REPAIR_LOCATION" },
  { label: "Problem / Customer Comment" },
  { label: "Priority", category: "PRIORITY" },
  { label: "Inquiry / Project Reference" },
  { label: "Attachments" },
  { label: "Assignment" },
  { label: "Created By / Department / Date" },
];

export function FixedTicketMasterFields({
  sections = [],
  legacyOptions = [],
  onChange,
  readOnly = false,
}) {
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [workingOptions, setWorkingOptions] = useState([]);
  const allOptions = ticketCoreOptions(sections, legacyOptions);

  const open = (field) => {
    if (!field.category) return;
    setSelected(field);
    setWorkingOptions([...(allOptions[field.category] || [])]);
    setDraft("");
  };
  const add = () => {
    const value = draft.trim();
    if (!value || workingOptions.includes(value)) return;
    setWorkingOptions((current) => [...current, value]);
    setDraft("");
  };
  const save = () => {
    const nextOptions = { ...allOptions, [selected.category]: workingOptions };
    onChange?.(
      mergeTicketFormSections(
        ticketDynamicSections(sections),
        nextOptions,
        sections,
      ),
    );
    setSelected(null);
  };
  const definition = selected
    ? TICKET_CORE_OPTION_DEFINITIONS.find(
        (item) => item.category === selected.category,
      )
    : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <LockKeyhole size={16} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Fixed Ticket Fields
          </h3>
          <p className="text-xs text-slate-500">
            Click a blue configurable field to manage its dropdown options for
            this Ticket Form version. Locked fields cannot be changed.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => {
          const configurable = Boolean(field.category);
          const count = configurable
            ? (allOptions[field.category] || []).length
            : 0;
          return (
            <button
              type="button"
              key={field.label}
              onClick={() => open(field)}
              disabled={!configurable}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${configurable ? "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 hover:bg-blue-100" : "cursor-default border-slate-200 bg-slate-50 text-slate-600"}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {configurable ? (
                  <Settings2 size={12} className="shrink-0 text-blue-600" />
                ) : (
                  <LockKeyhole size={12} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate">{field.label}</span>
              </span>
              {configurable && (
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm">
                  {count} options
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <Modal
          title={`${readOnly ? "View" : "Edit"} ${selected.label} Options`}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              These options apply only to this Ticket Form version.
            </p>
            <div className="min-h-16 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-2">
                {workingOptions.length ? (
                  workingOptions.map((option) => (
                    <span
                      key={option}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {option}
                      {!readOnly && (
                        <button
                          type="button"
                          title={`Remove ${option}`}
                          disabled={
                            definition?.category === "PRIORITY" &&
                            workingOptions.length === 1
                          }
                          onClick={() =>
                            setWorkingOptions((current) =>
                              current.filter((item) => item !== option),
                            )
                          }
                          className="rounded-full text-slate-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    No options configured.
                  </span>
                )}
              </div>
            </div>
            {!readOnly && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add();
                    }
                  }}
                  placeholder={`Add ${selected.label} option`}
                />
                <PrimaryButton type="button" onClick={add}>
                  <Plus size={14} /> Add
                </PrimaryButton>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setSelected(null)}>
                {readOnly ? "Close" : "Cancel"}
              </SecondaryButton>
              {!readOnly && (
                <PrimaryButton type="button" onClick={save}>
                  Save Options
                </PrimaryButton>
              )}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

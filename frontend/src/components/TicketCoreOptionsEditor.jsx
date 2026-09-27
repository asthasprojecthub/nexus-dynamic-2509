import React, { useState } from "react";
import { ListPlus, Plus, X } from "lucide-react";
import { Input } from "./ui";
import {
  mergeTicketFormSections,
  ticketCoreOptions,
  ticketDynamicSections,
  TICKET_CORE_OPTION_DEFINITIONS,
} from "../utils/ticketFormOptions";

export default function TicketCoreOptionsEditor({
  sections = [],
  legacyOptions = [],
  onChange,
  readOnly = false,
}) {
  const [drafts, setDrafts] = useState({});
  const options = ticketCoreOptions(sections, legacyOptions);
  const update = (category, values) =>
    onChange?.(
      mergeTicketFormSections(
        ticketDynamicSections(sections),
        { ...options, [category]: values },
        sections,
      ),
    );
  const add = (definition) => {
    const value = String(drafts[definition.category] || "").trim();
    if (!value || options[definition.category].includes(value)) return;
    update(definition.category, [...options[definition.category], value]);
    setDrafts((current) => ({ ...current, [definition.category]: "" }));
  };

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          <ListPlus size={16} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Core Dropdown Options
          </h3>
          <p className="text-xs text-slate-500">
            These choices belong only to this Ticket Form version. A new version
            copies them, and can then change them independently.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {TICKET_CORE_OPTION_DEFINITIONS.map((definition) => (
          <div
            key={definition.category}
            className="rounded-xl border border-slate-200 bg-white p-3"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {definition.label}
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {options[definition.category].length ? (
                options[definition.category].map((option) => (
                  <span
                    key={option}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {option}
                    {!readOnly && (
                      <button
                        type="button"
                        title={`Remove ${option}`}
                        disabled={
                          definition.category === "PRIORITY" &&
                          options[definition.category].length === 1
                        }
                        onClick={() =>
                          update(
                            definition.category,
                            options[definition.category].filter(
                              (item) => item !== option,
                            ),
                          )
                        }
                        className="rounded-full text-slate-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <X size={12} />
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
            {!readOnly && (
              <div className="flex gap-2">
                <Input
                  value={drafts[definition.category] || ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [definition.category]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add(definition);
                    }
                  }}
                  placeholder={`Add ${definition.label} option`}
                />
                <button
                  type="button"
                  onClick={() => add(definition)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Layers,
  Plus,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import {
  Field,
  ConfirmDialog,
  Input,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Status,
  Table,
} from "./ui";
import FormBuilder, { findMasterBuilderError, focusMasterBuilderError } from "./FormBuilder";
import { FixedTicketMasterFields } from "./FixedTicketFields";
import { FixedTimelineMasterFields } from "./FixedTimelineFields";
import { RowActions } from "./RecordUI";
import {
  ensureTicketFormOptions,
  mergeTicketFormSections,
  ticketCoreOptions,
  ticketDynamicSections,
} from "../utils/ticketFormOptions";

const countFields = (sections = []) =>
  sections.reduce(
    (sum, s) =>
      sum +
      (s.fields?.length || 0) +
      (s.subsections || []).reduce(
        (x, sub) => x + (sub.fields?.length || 0),
        0,
      ),
    0,
  );

export default function VersionedMasterPage({
  type = "inquiry",
  showHeader = true,
  showStandaloneAction = true,
  showActiveSummary = true,
}) {
  const navigate = useNavigate();
  const store = useStore();
  const config =
    type === "ticket"
      ? {
          master: store.data.ticketMaster,
          saveNew: store.saveTicketMasterVersion,
          toggle: store.toggleTicketMasterVersion,
          label: "Ticket",
          base: "/masters/tickets/versions",
          fixedCount: "fixed core",
        }
      : type === "project"
        ? {
            master: store.data.projectMaster,
            saveNew: store.saveProjectMasterVersion,
            toggle: store.toggleProjectMasterVersion,
            label: "Project",
            base: "/masters/project",
            fixedCount: "4 fixed",
          }
        : {
            master: store.data.inquiryMaster,
            saveNew: store.saveInquiryMasterVersion,
            toggle: store.toggleInquiryMasterVersion,
            label: "Inquiry",
            base: "/masters/inquiry",
            fixedCount: "4 fixed",
          };
  const { master, saveNew, toggle, label, base, fixedCount } = config;
  const versions = master?.versions || [];
  const active = versions.find((v) => v.is_active);
  const [creating, setCreating] = useState(false);
  const [sections, setSections] = useState([]);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);
  const toggleVersion = (row) => {
    if (!row.is_active) {
      setPendingActivate({
        row,
        name:row.form_name || `${label} Form v${row.version_no}`,
      });
      return;
    }
    const fallback = versions
      .filter((version) => version.id !== row.id)
      .slice()
      .sort((a, b) => (a.version_no || 0) - (b.version_no || 0))[0];
    if (!fallback) return;
    const currentName = row.form_name || `${label} Form v${row.version_no}`;
    const fallbackName = fallback.form_name || `${label} Form v${fallback.version_no}`;
    setPendingDeactivate({ row, fallback, currentName, fallbackName });
  };
  const openNew = () => {
    navigate(`${base}/new`);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const builderError = findMasterBuilderError(builderSections);
    if (builderError) {
      focusMasterBuilderError(builderError);
      return;
    }
    setSaving(true);
    try {
      await saveNew(sections, formName);
      setCreating(false);
      setSections([]);
      setFormName("");
    } catch {
    } finally {
      setSaving(false);
    }
  };
  const FixedFields =
    type === "ticket" ? FixedTicketMasterFields : FixedTimelineMasterFields;
  const builderSections =
    type === "ticket" ? ticketDynamicSections(sections) : sections;
  const updateBuilderSections = (next) =>
    setSections(
      type === "ticket"
        ? mergeTicketFormSections(
            next,
            ticketCoreOptions(sections, store.data.ticketMasterOptions || []),
            sections,
          )
        : next,
    );
  const fixedFieldProps =
    type === "ticket"
      ? {
          sections,
          legacyOptions: store.data.ticketMasterOptions || [],
          onChange: setSections,
        }
      : {};
  if (creating)
    return (
      <div className="fade-in mx-auto max-w-[1500px]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                New {label} Master Version
              </h1>
              <p className="text-sm text-slate-500">
                Give the form a clear name, then configure its sections and
                fields.
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="max-w-xl">
              <Field label="Form Name" required>
                <Input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={`${label} Form Name`}
                />
              </Field>
            </div>
          </section>
          <FixedFields {...fixedFieldProps} />
          <FormBuilder
            sections={builderSections}
            onChange={updateBuilderSections}
          />
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setCreating(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save & Activate Version"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );
  return (
    <div className="fade-in">
      {showHeader && <PageHeader
        title={`${label} Master`}
        description={
          type === "ticket"
            ? "Configure versioned Ticket fields without changing the database. Core Ticket fields remain fixed and protected."
            : `Configure dynamic ${label.toLowerCase()} fields. Four fixed timeline fields are always included and cannot be removed.`
        }
        action={
          <PrimaryButton onClick={openNew}>
            <Plus size={16} /> New Version
          </PrimaryButton>
        }
      />}
      {!showHeader && showStandaloneAction && <div className="mb-4 flex justify-end"><PrimaryButton onClick={openNew}><Plus size={16} /> New Version</PrimaryButton></div>}
      {showActiveSummary && (active ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">
                  {active.form_name || `${label} Form v${active.version_no}`}
                </p>
                <p className="text-xs text-emerald-600">
                  Active v{active.version_no} ·{" "}
                  {
                    (type === "ticket"
                      ? ticketDynamicSections(active.sections || [])
                      : active.sections || []
                    ).length
                  }{" "}
                  sections ·{" "}
                  {countFields(
                    type === "ticket"
                      ? ticketDynamicSections(active.sections || [])
                      : active.sections,
                  )}{" "}
                  dynamic + {fixedCount} fields
                </p>
              </div>
            </div>
            <SecondaryButton
              onClick={() => navigate(`${base}/${active.id}/view`)}
              className="!py-1.5 !text-xs"
            >
              View Active Form
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-dashed border-slate-300 py-10 text-center text-slate-400">
          <Layers size={34} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">
            No {label} version configured.
          </p>
        </div>
      ))}
      <Table
        rows={versions}
        empty="No versions created yet."
        onRowClick={(row) => navigate(`${base}/${row.id}/view`)}
        columns={[
          {
            key: "form_name",
            label: "Form Name",
            render: (v, row) => (
              <span className="font-semibold text-slate-900">
                {v || `${label} Form v${row.version_no}`}
              </span>
            ),
          },
          {
            key: "version_no",
            label: "Version",
            render: (v, row) => (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-700">v{v}</span>
                {row.is_active && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    ACTIVE
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "sections",
            label: "Sections",
            render: (v) =>
              type === "ticket"
                ? ticketDynamicSections(v || []).length
                : (v || []).length,
          },
          {
            key: "field_count",
            label: "Fields",
            render: (_, row) =>
              `${countFields(type === "ticket" ? ticketDynamicSections(row.sections || []) : row.sections || [])} dynamic + ${fixedCount}`,
          },
          { key: "created_at", label: "Created" },
          { key: "created_by", label: "Created By" },
          {
            key: "is_active",
            label: "Status",
            render: (v) => <Status value={v ? "Active" : "Inactive"} />,
          },
          {
            key: "id",
            label: "Actions",
            render: (_, row) => (
              <div className="flex items-center justify-end gap-1">
                <RowActions
                  onView={() => navigate(`${base}/${row.id}/view`)}
                  onEdit={() => navigate(`${base}/${row.id}/edit`)}
                />
                <button
                  type="button"
                  title={
                    row.is_active
                      ? versions.length === 1
                        ? "Create another version before deactivating"
                        : "Deactivate and activate the latest remaining version"
                      : "Set Active"
                  }
                  disabled={row.is_active && versions.length === 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVersion(row);
                  }}
                  className={`rounded-lg p-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${row.is_active ? "text-emerald-600 hover:bg-rose-50 hover:text-rose-600" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"}`}
                >
                  {row.is_active ? (
                    <ToggleRight size={17} />
                  ) : (
                    <ToggleLeft size={17} />
                  )}
                </button>
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!pendingActivate}
        title="Activate form version?"
        message={pendingActivate ? `Are you sure you want to activate ${pendingActivate.name} · Version ${pendingActivate.row.version_no}?` : ''}
        confirmLabel="Activate"
        onCancel={()=>setPendingActivate(null)}
        onConfirm={()=>{const pending=pendingActivate;setPendingActivate(null);if(pending)toggle(pending.row.id,true);}}
      />
      <ConfirmDialog
        open={!!pendingDeactivate}
        title="Deactivate form version?"
        message={pendingDeactivate ? `Are you sure you want to deactivate Version ${pendingDeactivate.row.version_no} – ${pendingDeactivate.currentName}?\n\nVersion ${pendingDeactivate.fallback.version_no} – ${pendingDeactivate.fallbackName} will be activated.` : ''}
        confirmLabel="Deactivate"
        danger
        onCancel={()=>setPendingDeactivate(null)}
        onConfirm={()=>{const pending=pendingDeactivate;setPendingDeactivate(null);if(pending)toggle(pending.row.id,false);}}
      />
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import {
  Field,
  Input,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Status,
} from "../components/ui";
import FormBuilder, { findMasterBuilderError, focusMasterBuilderError } from "../components/FormBuilder";
import { FixedTicketMasterFields } from "../components/FixedTicketFields";
import { FixedTimelineMasterFields } from "../components/FixedTimelineFields";
import { DetailHeader, FormStructureView, Info } from "../components/RecordUI";
import {
  ensureTicketFormOptions,
  mergeTicketFormSections,
  ticketCoreOptions,
  ticketDynamicSections,
} from "../utils/ticketFormOptions";

function SaveVersionDialog({ open, name, saving, onCancel, onSaveOnly, onSaveAndActivate }) {
  if (!open) return null;
  return (
    <Modal title="Save Master Version" onClose={() => !saving && onCancel()}>
      <p className="text-sm leading-6 text-slate-600">
        Do you want to activate “{name}” after saving it?
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Save Only keeps the currently active version unchanged. Save &amp; Activate makes this version active for newly created records.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <SecondaryButton type="button" disabled={saving} onClick={onCancel}>Cancel</SecondaryButton>
        <button type="button" disabled={saving} onClick={onSaveOnly} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Save Only</button>
        <PrimaryButton type="button" disabled={saving} onClick={onSaveAndActivate}>{saving ? "Saving..." : "Save & Activate"}</PrimaryButton>
      </div>
    </Modal>
  );
}

export default function MasterVersionPage({
  type = "inquiry",
  editable = false,
  createMode = false,
}) {
  const params = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const { data } = store;
  const panel =
    type === "panel"
      ? (data.panelMasters || []).find((item) => item.id === params.id)
      : null;
  const versionId = type === "panel" ? params.versionId : params.id;
  const config =
    type === "panel"
      ? {
          master: panel ? { versions: panel.versions || [] } : null,
          label: panel?.panel_type || "Panel",
          base: `/masters/panels/${params.id}/versions`,
          root: `/masters/panels/${params.id}/view`,
          save: (sections, formName, activate) =>
            store.savePanelMasterVersion(params.id, sections, formName, activate),
          update: (id, patch) =>
            store.updatePanelMasterVersion(params.id, id, patch),
          FixedFields: () => null,
        }
      : type === "ticket"
      ? {
          master: data.ticketMaster,
          label: "Ticket",
          base: "/masters/tickets/versions",
          root: "/masters/tickets",
          save: store.saveTicketMasterVersion,
          update: store.updateTicketMasterVersion,
          FixedFields: FixedTicketMasterFields,
        }
      : type === "project"
        ? {
            master: data.projectMaster,
            label: "Project",
            base: "/masters/project",
            root: "/masters/project",
            save: store.saveProjectMasterVersion,
            update: store.updateProjectMasterVersion,
            FixedFields: FixedTimelineMasterFields,
          }
        : {
            master: data.inquiryMaster,
            label: "Inquiry",
            base: "/masters/inquiry",
            root: "/masters/inquiry",
            save: store.saveInquiryMasterVersion,
            update: store.updateInquiryMasterVersion,
            FixedFields: FixedTimelineMasterFields,
          };
  const { master, label, base, root, FixedFields } = config;
  const versions = master?.versions || [];
  const firstVersion =
    versions.find((v) => Number(v.version_no) === 1) ||
    versions.slice().sort((a, b) => Number(a.version_no) - Number(b.version_no))[0];
  const record = useMemo(
    () => versions.find((v) => v.id === versionId),
    [versions, versionId],
  );
  const nextVersion =
    Math.max(0, ...versions.map((v) => Number(v.version_no) || 0)) + 1;
  const defaultName = createMode
    ? `${label} Form v${nextVersion}`
    : record?.form_name || `${label} Form v${record?.version_no || ""}`;
  const rawDefaultSections = createMode
    ? []
    : JSON.parse(JSON.stringify(record?.sections || []));
  const defaultSections =
    type === "ticket"
      ? ensureTicketFormOptions(
          rawDefaultSections,
          data.ticketMasterOptions || [],
        )
      : rawDefaultSections;
  const [formName, setFormName] = useState(defaultName);
  const [sections, setSections] = useState(defaultSections);
  const [versionStart, setVersionStart] = useState("scratch");
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const hydratedKey = useRef("");
  useEffect(() => {
    if (!createMode && !record) return;
    const key = createMode
      ? `new:${type}:${firstVersion?.id || "none"}:${versionStart}:${(data.ticketMasterOptions || []).length}`
      : `${type}:${record.id}`;
    if (hydratedKey.current === key) return;
    const source = createMode
      ? versionStart === "first" && firstVersion
        ? JSON.parse(JSON.stringify(firstVersion.sections || []))
        : []
      : JSON.parse(JSON.stringify(record.sections || []));
    setFormName(
      createMode
        ? `${label} Form v${nextVersion}`
        : record.form_name || `${label} Form v${record.version_no}`,
    );
    setSections(
      type === "ticket"
        ? ensureTicketFormOptions(source, data.ticketMasterOptions || [])
        : source,
    );
    hydratedKey.current = key;
  }, [
    createMode,
    type,
    firstVersion?.id,
    record?.id,
    nextVersion,
    label,
    data.ticketMasterOptions,
    versionStart,
  ]);
  const builderSections =
    type === "ticket" ? ticketDynamicSections(sections) : sections;
  const updateBuilderSections = (next) =>
    setSections(
      type === "ticket"
        ? mergeTicketFormSections(
            next,
            ticketCoreOptions(sections, data.ticketMasterOptions || []),
            sections,
          )
        : next,
    );
  const fixedFieldProps =
    type === "ticket"
      ? {
          sections,
          legacyOptions: data.ticketMasterOptions || [],
          onChange: setSections,
        }
      : {};

  if (!createMode && !record)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Master version not found.
      </div>
    );

  const save = (e) => {
    e.preventDefault();
    if (saving) return;
    const builderError = findMasterBuilderError(builderSections);
    if (builderError) {
      focusMasterBuilderError(builderError);
      return;
    }
    setPendingSave(true);
  };

  const performSave = async (activate) => {
    if (saving) return;
    setPendingSave(false);
    setSaving(true);
    try {
      if (createMode) {
        await config.save(sections, formName.trim() || defaultName, activate);
      } else {
        const patch = {
          form_name: formName.trim() || `${label} Form v${record.version_no}`,
          sections,
          ...(activate ? { is_active: true } : {}),
        };
        await config.update(versionId, patch);
      }
      navigate(root);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  if (createMode)
    return (
      <div className="fade-in mx-auto max-w-[1500px]">
        <DetailHeader
          title={`New ${label} Master Version`}
          subtitle="Create a new version on a separate page"
          editing
          onBack={() => navigate(root)}
          actions={<><button type="button" onClick={() => setVersionStart("first")} className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${versionStart === "first" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>Copy Version 1 Fields</button><button type="button" onClick={() => setVersionStart("scratch")} className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${versionStart === "scratch" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>Blank Version</button></>}
        />
        <form onSubmit={save} className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={type === "panel" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "max-w-xs"}>
              <Field label="Form Name" required>
                <Input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={`${label} Form Name`}
                />
              </Field>
              {type === "panel" && <>
                <Field label="Panel Code">
                  <Input value={panel?.panel_code || ""} disabled />
                </Field>
                <Field label="Panel Type">
                  <Input value={panel?.panel_type || ""} disabled />
                </Field>
                <Field label="Version">
                  <Input value={`v${nextVersion}`} disabled />
                </Field>
              </>}
            </div>
          </section>
          <FixedFields {...fixedFieldProps} />
          <FormBuilder
            sections={builderSections}
            onChange={updateBuilderSections}
          />
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => navigate(root)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Version"}
            </PrimaryButton>
          </div>
        </form>
        <SaveVersionDialog open={pendingSave} name={formName.trim() || defaultName} saving={saving} onCancel={() => setPendingSave(false)} onSaveOnly={() => performSave(false)} onSaveAndActivate={() => performSave(true)} />
      </div>
    );

  if (!editable)
    return (
      <div className="fade-in mx-auto max-w-[1500px]">
        <DetailHeader
          title={record.form_name || `${label} Form v${record.version_no}`}
          subtitle={`${label} Master · Read-only view`}
          onBack={() => navigate(root)}
          onEdit={() => navigate(`${base}/${versionId}/edit`)}
        />
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Info
            label="Form Name"
            value={record.form_name || `${label} Form v${record.version_no}`}
          />
          <Info label="Version" value={`v${record.version_no}`} />
          <Info label="Created" value={record.created_at} />
          <Info
            label="Status"
            value={<Status value={record.is_active ? "Active" : "Inactive"} />}
          />
        </div>
        <div className="mb-4">
          <FixedFields
            {...(type === "ticket"
              ? {
                  sections: record.sections || [],
                  legacyOptions: data.ticketMasterOptions || [],
                  readOnly: true,
                }
              : {})}
          />
        </div>
        <FormStructureView
          sections={
            type === "ticket"
              ? ticketDynamicSections(record.sections || [])
              : record.sections || []
          }
        />
      </div>
    );

  return (
    <div className="fade-in mx-auto max-w-[1500px]">
      <DetailHeader
        title={`Edit ${record.form_name || `${label} Form`}`}
        subtitle={`${label} Master · Edit page`}
        editing
        onBack={() => navigate(root)}
      />
      <form onSubmit={save} className="space-y-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Form Name" required>
              <Input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={`${label} Form Name`}
              />
            </Field>
            <Field label="Version">
              <Input value={`v${record.version_no}`} disabled />
            </Field>
            <Field label="Created By">
              <Input value={record.created_by || "Nexus Admin"} disabled />
            </Field>
            <Field label="Status">
              <Input
                value={record.is_active ? "Active" : "Inactive"}
                disabled
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
          <SecondaryButton type="button" onClick={() => navigate(root)}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
      <SaveVersionDialog open={pendingSave} name={formName.trim() || `${label} Form v${record.version_no}`} saving={saving} onCancel={() => setPendingSave(false)} onSaveOnly={() => performSave(false)} onSaveAndActivate={() => performSave(true)} />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import {
  ConfirmDialog,
  Field,
  Input,
  PrimaryButton,
  SecondaryButton,
  Status,
  Table,
  Toggle,
} from "../components/ui";
import { DetailHeader, Info, RowActions } from "../components/RecordUI";

const panelInfo = (record) => ({
  form_name: record.form_name || `${record.panel_type} Form`,
  panel_code: record.panel_code || "",
  panel_type: record.panel_type || "",
  is_active: record.is_active !== false,
});

export default function PanelMasterDetailPage({ editable = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, updatePanelMaster, togglePanelMasterVersion } = useStore();
  const record = useMemo(
    () => (data.panelMasters || []).find((panel) => panel.id === id),
    [data.panelMasters, id],
  );
  const [editingInfo, setEditingInfo] = useState(
    editable || location.state?.editPanelInfo === true,
  );
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);

  useEffect(() => {
    if (record) setForm(panelInfo(record));
  }, [record]);

  if (!record || !form)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Panel master not found.
      </div>
    );

  const versions = record.versions || [];
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updatePanelMaster(id, {
        form_name:
          form.form_name.trim() || `${form.panel_type.trim()} Form`,
        panel_code: form.panel_code.trim().toUpperCase(),
        panel_type: form.panel_type.trim(),
        is_active: form.is_active,
      });
      setEditingInfo(false);
      navigate(`/masters/panels/${id}/view`, { replace: true });
    } catch {
      // Keep the inline editor open when the API rejects the update.
    } finally {
      setSaving(false);
    }
  };
  const cancelEdit = () => {
    setForm(panelInfo(record));
    setEditingInfo(false);
    navigate(`/masters/panels/${id}/view`, { replace: true });
  };
  const toggleVersion = (row) => {
    if (!row.is_active) {
      setPendingActivate({
        row,
        name: row.form_name || `${record.panel_type} Form v${row.version_no}`,
      });
      return;
    }
    const fallback = versions
      .filter((version) => version.id !== row.id)
      .slice()
      .sort((a, b) => (a.version_no || 0) - (b.version_no || 0))[0];
    if (!fallback) return;
    const currentName =
      row.form_name || `${record.panel_type} Form v${row.version_no}`;
    const fallbackName =
      fallback.form_name ||
      `${record.panel_type} Form v${fallback.version_no}`;
    setPendingDeactivate({
      row,
      fallback,
      currentName,
      fallbackName,
    });
  };
  const versionColumns = [
    {
      key: "form_name",
      label: "Form Name",
      render: (value, row) => (
        <span className="font-semibold text-slate-900">
          {value || `${record.panel_type} Form v${row.version_no}`}
        </span>
      ),
    },
    {
      key: "version_no",
      label: "Version",
      render: (value) => (
        <span className="font-semibold text-blue-700">v{value}</span>
      ),
    },
    { key: "created_at", label: "Created" },
    { key: "created_by", label: "Created By" },
    {
      key: "is_active",
      label: "Status",
      render: (value) => (
        <Status value={value ? "Active" : "Inactive"} />
      ),
    },
    {
      key: "id",
      label: "Actions",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <RowActions
            onView={() =>
              navigate(`/masters/panels/${id}/versions/${row.id}/view`)
            }
            onEdit={() =>
              navigate(`/masters/panels/${id}/versions/${row.id}/edit`)
            }
          />
          <button
            type="button"
            disabled={row.is_active && versions.length === 1}
            onClick={() => toggleVersion(row)}
            title={
              row.is_active
                ? versions.length === 1
                  ? "Create another version before deactivating"
                  : "Deactivate and activate Version 1"
                : "Set Active"
            }
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
  ];

  return (
    <div className="fade-in mx-auto max-w-[1400px]">
      <DetailHeader
        title={record.panel_type}
        subtitle="Panel Master · Panel information and form versions"
        onBack={() => navigate("/masters/panels")}
        onEdit={editingInfo ? undefined : () => setEditingInfo(true)}
        editing={editingInfo}
        actions={
          <PrimaryButton
            type="button"
            onClick={() => navigate(`/masters/panels/${id}/versions/new`)}
          >
            <Plus size={14} /> New Version
          </PrimaryButton>
        }
      />

      {editingInfo ? (
        <form
          onSubmit={save}
          className="mb-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">
              Edit Panel Information
            </h2>
            <p className="text-xs text-slate-500">
              Update the panel details here without leaving this page.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Form Name" required>
              <Input
                required
                value={form.form_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    form_name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Panel Code" required>
              <Input
                required
                value={form.panel_code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    panel_code: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Panel Type" required>
              <Input
                required
                value={form.panel_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    panel_type: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="flex items-end">
              <div className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3">
                <span className="text-sm font-medium">Active</span>
                <Toggle
                  checked={form.is_active}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      is_active: value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <SecondaryButton type="button" onClick={cancelEdit}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Panel Information"}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Info
            label="Form Name"
            value={record.form_name || `${record.panel_type} Form`}
          />
          <Info label="Panel Code" value={record.panel_code} />
          <Info label="Panel Type" value={record.panel_type} />
          <Info
            label="Status"
            value={
              <Status value={record.is_active ? "Active" : "Inactive"} />
            }
          />
        </div>
      )}

      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900">
          Panel Form Versions
        </h2>
        <p className="text-xs text-slate-400">
          Each version has its own Form Name and field structure.
        </p>
      </div>
      <Table
        rows={versions}
        empty="No panel form versions yet."
        onRowClick={(row) =>
          navigate(`/masters/panels/${id}/versions/${row.id}/view`)
        }
        columns={versionColumns}
      />
      <ConfirmDialog
        open={!!pendingActivate}
        title="Activate form version?"
        message={
          pendingActivate
            ? `Are you sure you want to activate ${pendingActivate.name} · Version ${pendingActivate.row.version_no}?`
            : ""
        }
        confirmLabel="Activate"
        onCancel={() => setPendingActivate(null)}
        onConfirm={() => {
          const pending = pendingActivate;
          setPendingActivate(null);
          if (pending)
            togglePanelMasterVersion(id, pending.row.id, true);
        }}
      />
      <ConfirmDialog
        open={!!pendingDeactivate}
        title="Deactivate form version?"
        message={
          pendingDeactivate
            ? `Are you sure you want to deactivate Version ${pendingDeactivate.row.version_no} – ${pendingDeactivate.currentName}?\n\nVersion ${pendingDeactivate.fallback.version_no} – ${pendingDeactivate.fallbackName} will be activated.`
            : ""
        }
        confirmLabel="Deactivate"
        danger
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          const pending = pendingDeactivate;
          setPendingDeactivate(null);
          if (pending)
            togglePanelMasterVersion(id, pending.row.id, false);
        }}
      />
    </div>
  );
}

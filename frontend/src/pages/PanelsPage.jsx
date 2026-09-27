import React, { useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import {
  Field,
  Input,
  matchesSearch,
  PageHeader,
  PrimaryButton,
  SearchBox,
  SecondaryButton,
  Status,
  Table,
  Toggle,
} from "../components/ui";
import FormBuilder, {
  findMasterBuilderError,
  focusMasterBuilderError,
} from "../components/FormBuilder";
import { RowActions } from "../components/RecordUI";

const emptyForm = () => ({
  form_name: "",
  panel_code: "",
  panel_type: "",
  is_active: true,
});

export default function PanelsPage({ createMode = false }) {
  const { data, addPanelMaster } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const rows = useMemo(
    () =>
      (data.panelMasters || []).filter((panel) =>
        matchesSearch(
          [panel.form_name, panel.panel_code, panel.panel_type],
          q,
        ),
      ),
    [data.panelMasters, q],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const builderError = findMasterBuilderError(sections);
    if (builderError) {
      focusMasterBuilderError(builderError);
      return;
    }
    setSaving(true);
    try {
      await addPanelMaster({
        ...form,
        form_name:
          form.form_name.trim() || `${form.panel_type.trim()} Form`,
        panel_code: form.panel_code.trim().toUpperCase(),
        panel_type: form.panel_type.trim(),
        sections,
      });
      navigate("/masters/panels");
    } catch {
      // The store keeps the API error visible and the form stays open.
    } finally {
      setSaving(false);
    }
  };

  if (createMode)
    return (
      <div className="fade-in mx-auto max-w-[1500px]">
        <div className="mb-4 flex items-start gap-2">
          <button
            type="button"
            onClick={() => navigate("/masters/panels")}
            className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              New Panel Master
            </h1>
            <p className="text-sm text-slate-500">
              Create the panel information and its first form version together.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                  placeholder="PLC Panel Form"
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
                  placeholder="PLC-STD"
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
                  placeholder="PLC Panel"
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
          </section>

          <FormBuilder sections={sections} onChange={setSections} />

          <div className="flex justify-end gap-2">
            <SecondaryButton
              type="button"
              onClick={() => navigate("/masters/panels")}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create Panel & Version 1"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );

  return (
    <div className="fade-in">
      <PageHeader
        title="Panel Master"
        description="Panel definitions and their versioned dynamic forms."
        action={
          <PrimaryButton onClick={() => navigate("/masters/panels/new")}>
            <Plus size={16} /> New Panel
          </PrimaryButton>
        }
      />
      <div className="mb-3">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search form, panel code or type..."
        />
      </div>
      <Table
        rows={rows}
        onRowClick={(row) => navigate(`/masters/panels/${row.id}/view`)}
        columns={[
          {
            key: "form_name",
            label: "Form Name",
            render: (value, row) => (
              <span className="font-semibold text-slate-900">
                {value || `${row.panel_type} Form`}
              </span>
            ),
          },
          {
            key: "panel_code",
            label: "Panel Code",
            render: (value) => (
              <span className="font-semibold text-blue-700">{value}</span>
            ),
          },
          { key: "panel_type", label: "Panel Type" },
          {
            key: "versions",
            label: "Versions",
            render: (value) => (value || []).length,
          },
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
              <RowActions
                onView={() => navigate(`/masters/panels/${row.id}/view`)}
                onEdit={() =>
                  navigate(`/masters/panels/${row.id}/view`, {
                    state: { editPanelInfo: true },
                  })
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}

import React, { useState } from "react";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";
import {
  Field,
  Input,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Select,
  Status,
  Table,
  Textarea,
  Toggle,
} from "../components/ui";

const fieldTypes = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "multiselect",
  "yesno",
  "user",
  "department",
  "vendor",
  "product",
  "file",
];
const roles = [
  ["ADMIN", "Admin"],
  ["HOD", "HOD"],
  ["TL", "Team Lead"],
  ["EMPLOYEE", "Employee"],
];
const blank = () => ({
  status_code: "",
  status_name: "",
  status_category: "ACTIVE",
  sequence: 1,
  color: "#2563eb",
  sla_days: 3,
  popup_required: true,
  dynamic_fields: [],
  allowed_next_status_codes: [],
  allowed_role_codes: ["ADMIN", "HOD", "TL", "EMPLOYEE"],
  allowed_department_ids: [],
  notification_rules: {
    assignee: true,
    creator: true,
    roles: ["ADMIN"],
    departments: [],
  },
  escalation_rules: {
    assignee: true,
    roles: ["TL", "HOD", "ADMIN"],
    departments: [],
  },
  is_active: true,
});
const toggle = (items, value) =>
  items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
const FieldChecks = ({
  items,
  selected,
  onToggle,
  labelOf = (item) => item,
}) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => {
      const value = Array.isArray(item) ? item[0] : item;
      const label = Array.isArray(item) ? item[1] : labelOf(item);
      const checked = selected.includes(value);
      return (
        <button
          key={value}
          type="button"
          onClick={() => onToggle(value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}
        >
          {checked ? "✓ " : ""}
          {label}
        </button>
      );
    })}
  </div>
);

export default function TicketWorkflowPage() {
  const { data, refresh } = useStore();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const permissions = data.currentUser?.permissions || [];
  const canCreate = permissions.includes("TICKET_WORKFLOW.CREATE");
  const canUpdate = permissions.includes("TICKET_WORKFLOW.UPDATE");
  const open = (row = null) => {
    setEditing(row || {});
    setForm(row ? JSON.parse(JSON.stringify(row)) : blank());
    setError("");
  };
  const save = async (event) => {
    event.preventDefault();
    const missingFieldIndex = (form.dynamic_fields || []).findIndex((field) => !String(field.label || '').trim());
    if (missingFieldIndex >= 0) {
      setError('Field label is required. Enter the field name before saving.');
      window.setTimeout(() => document.querySelector(`[data-ticket-field-label="${missingFieldIndex}"]`)?.focus(), 0);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(
        editing?.id ? `/ticket-workflows/${editing.id}` : "/ticket-workflows",
        { method: editing?.id ? "PATCH" : "POST", body: JSON.stringify(form) },
      );
      await refresh();
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const setField = (index, patch) =>
    setForm((old) => ({
      ...old,
      dynamic_fields: old.dynamic_fields.map((field, i) =>
        i === index ? { ...field, ...patch } : field,
      ),
    }));
  const addField = () =>
    setForm((old) => ({
      ...old,
      dynamic_fields: [
        ...old.dynamic_fields,
        {
          key: `field_${old.dynamic_fields.length + 1}`,
          label: "New Field",
          type: "text",
          required: false,
          options: [],
        },
      ],
    }));
  const toggleRuleRole = (rule, role) =>
    setForm((old) => ({
      ...old,
      [rule]: {
        ...(old[rule] || {}),
        roles: toggle(old[rule]?.roles || [], role),
      },
    }));
  return (
    <div className="fade-in">
      <PageHeader
        title="Ticket Workflow / Status Master"
        description="Dynamic statuses, popup fields, transitions, permissions, notifications and SLA escalation."
        action={
          canCreate ? (
            <PrimaryButton onClick={() => open()}>
              <Plus size={15} />
              Add Status
            </PrimaryButton>
          ) : null
        }
      />
      <Table
        rows={data.ticketWorkflows || []}
        columns={[
          { key: "sequence", label: "Sequence" },
          {
            key: "status_name",
            label: "Status",
            render: (value, row) => (
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="font-bold text-slate-900">{value}</span>
              </div>
            ),
          },
          { key: "status_category", label: "Category" },
          {
            key: "sla_days",
            label: "SLA",
            render: (value) => `${value} day${value === 1 ? "" : "s"}`,
          },
          {
            key: "popup_required",
            label: "Popup",
            render: (value) => (value ? "Required" : "Optional"),
          },
          {
            key: "dynamic_fields",
            label: "Fields",
            render: (value) => (value || []).length,
          },
          {
            key: "is_active",
            label: "Status",
            render: (value) => <Status value={value ? "Active" : "Inactive"} />,
          },
          {
            key: "id",
            label: "Action",
            render: (_, row) =>
              canUpdate ? (
                <button
                  onClick={() => open(row)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                >
                  <Pencil size={15} />
                </button>
              ) : null,
          },
        ]}
      />
      {editing && (
        <Modal
          wide
          title={
            editing.id
              ? `Edit Workflow · ${editing.status_name}`
              : "Add Ticket Workflow Status"
          }
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="space-y-5">
            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch size={16} />
                <h3 className="text-sm font-bold">Status Configuration</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Status Name" required>
                  <Input
                    required
                    value={form.status_name}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        status_name: e.target.value,
                        status_code:
                          old.status_code ||
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]+/g, "_"),
                      }))
                    }
                  />
                </Field>
                <Field label="Status Code" required>
                  <Input
                    required
                    value={form.status_code}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        status_code: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]+/g, "_"),
                      }))
                    }
                  />
                </Field>
                <Field label="Category">
                  <Select
                    value={form.status_category}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        status_category: e.target.value,
                      }))
                    }
                  >
                    {[
                      "NEW",
                      "ACTIVE",
                      "WAITING",
                      "LOGISTICS",
                      "HOLD",
                      "RESOLVED",
                      "CLOSED",
                    ].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sequence">
                  <Input
                    type="number"
                    min="1"
                    value={form.sequence}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        sequence: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label="Color">
                  <Input
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((old) => ({ ...old, color: e.target.value }))
                    }
                  />
                </Field>
                <Field label="SLA Days">
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={form.sla_days}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        sla_days: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <div className="flex items-end">
                  <div className="flex h-10 w-full items-center justify-between rounded-lg border px-3">
                    <span className="text-sm">Popup Required</span>
                    <Toggle
                      checked={form.popup_required}
                      onChange={(value) =>
                        setForm((old) => ({ ...old, popup_required: value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="flex h-10 w-full items-center justify-between rounded-lg border px-3">
                    <span className="text-sm">Active</span>
                    <Toggle
                      checked={form.is_active}
                      onChange={(value) =>
                        setForm((old) => ({ ...old, is_active: value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </section>
            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">Dynamic Popup Fields</h3>
                  <p className="text-xs text-slate-400">
                    Configure conditional inputs shown whenever this status is
                    selected.
                  </p>
                </div>
                <SecondaryButton type="button" onClick={addField}>
                  <Plus size={14} />
                  Add Field
                </SecondaryButton>
              </div>
              <div className="space-y-3">
                {form.dynamic_fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-5 text-center text-xs text-slate-400">
                    No popup fields configured.
                  </p>
                ) : (
                  form.dynamic_fields.map((field, index) => (
                    <div
                      key={`${field.key}-${index}`}
                      className="rounded-lg border bg-slate-50 p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                        <Field label="Label">
                          <Input
                            data-ticket-field-label={index}
                            value={field.label}
                            onChange={(e) =>
                              setField(index, { label: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Key">
                          <Input
                            value={field.key}
                            onChange={(e) =>
                              setField(index, {
                                key: e.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "_"),
                              })
                            }
                          />
                        </Field>
                        <Field label="Field Type">
                          <Select
                            value={field.type}
                            onChange={(e) =>
                              setField(index, { type: e.target.value })
                            }
                          >
                            {fieldTypes.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Required">
                          <Select
                            value={field.required ? "yes" : "no"}
                            onChange={(e) =>
                              setField(index, {
                                required: e.target.value === "yes",
                              })
                            }
                          >
                            <option value="no">Optional</option>
                            <option value="yes">Required</option>
                          </Select>
                        </Field>
                        <Field label="Condition Field">
                          <Select
                            value={field.condition?.field_key || ""}
                            onChange={(e) =>
                              setField(index, {
                                condition: e.target.value
                                  ? {
                                      field_key: e.target.value,
                                      operator: "equals",
                                      value: "",
                                    }
                                  : undefined,
                              })
                            }
                          >
                            <option value="">Always show</option>
                            {form.dynamic_fields
                              .filter((_, i) => i !== index)
                              .map((item) => (
                                <option key={item.key} value={item.key}>
                                  {item.label}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <div className="flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((old) => ({
                                ...old,
                                dynamic_fields: old.dynamic_fields.filter(
                                  (_, i) => i !== index,
                                ),
                              }))
                            }
                            className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {["dropdown", "multiselect"].includes(field.type) && (
                        <div className="mt-2">
                          <Field label="Dropdown Options (one per line or comma separated)">
                            <Textarea
                              rows={2}
                              value={(field.options || []).join(", ")}
                              onChange={(e) =>
                                setField(index, {
                                  options: e.target.value
                                    .split(/[\n,]/)
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {field.condition?.field_key && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Field label="Condition Operator">
                            <Select
                              value={field.condition.operator || "equals"}
                              onChange={(e) =>
                                setField(index, {
                                  condition: {
                                    ...field.condition,
                                    operator: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="equals">Equals</option>
                              <option value="not_equals">Not Equals</option>
                              <option value="includes">Includes</option>
                            </Select>
                          </Field>
                          <Field label="Condition Value">
                            <Input
                              value={field.condition.value || ""}
                              onChange={(e) =>
                                setField(index, {
                                  condition: {
                                    ...field.condition,
                                    value: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-bold">Allowed Next Status</h3>
                <FieldChecks
                  items={(data.ticketWorkflows || [])
                    .filter((item) => item.id !== editing.id)
                    .map((item) => [item.status_code, item.status_name])}
                  selected={form.allowed_next_status_codes || []}
                  onToggle={(value) =>
                    setForm((old) => ({
                      ...old,
                      allowed_next_status_codes: toggle(
                        old.allowed_next_status_codes || [],
                        value,
                      ),
                    }))
                  }
                />
              </div>
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-bold">Role Permission</h3>
                <FieldChecks
                  items={roles}
                  selected={form.allowed_role_codes || []}
                  onToggle={(value) =>
                    setForm((old) => ({
                      ...old,
                      allowed_role_codes: toggle(
                        old.allowed_role_codes || [],
                        value,
                      ),
                    }))
                  }
                />
                <h3 className="mb-2 mt-4 text-sm font-bold">
                  Department Permission
                </h3>
                <FieldChecks
                  items={(data.departments || []).map((item) => [
                    item.id,
                    item.department_name,
                  ])}
                  selected={form.allowed_department_ids || []}
                  onToggle={(value) =>
                    setForm((old) => ({
                      ...old,
                      allowed_department_ids: toggle(
                        old.allowed_department_ids || [],
                        value,
                      ),
                    }))
                  }
                />
                <p className="mt-2 text-[10px] text-slate-400">
                  No department selected means all departments allowed.
                </p>
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-bold">Notification Rules</h3>
                <FieldChecks
                  items={[
                    ["assignee", "Assignee"],
                    ["creator", "Created By"],
                  ]}
                  selected={["assignee", "creator"].filter(
                    (key) => form.notification_rules?.[key],
                  )}
                  onToggle={(key) =>
                    setForm((old) => ({
                      ...old,
                      notification_rules: {
                        ...(old.notification_rules || {}),
                        [key]: !old.notification_rules?.[key],
                      },
                    }))
                  }
                />
                <p className="mb-2 mt-3 text-xs font-semibold text-slate-600">
                  Notify roles
                </p>
                <FieldChecks
                  items={roles}
                  selected={form.notification_rules?.roles || []}
                  onToggle={(role) =>
                    toggleRuleRole("notification_rules", role)
                  }
                />
                <p className="mb-2 mt-3 text-xs font-semibold text-slate-600">
                  Notify departments
                </p>
                <FieldChecks
                  items={(data.departments || []).map((item) => [
                    item.id,
                    item.department_name,
                  ])}
                  selected={form.notification_rules?.departments || []}
                  onToggle={(value) =>
                    setForm((old) => ({
                      ...old,
                      notification_rules: {
                        ...(old.notification_rules || {}),
                        departments: toggle(
                          old.notification_rules?.departments || [],
                          value,
                        ),
                      },
                    }))
                  }
                />
              </div>
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-bold">Escalation Rules</h3>
                <FieldChecks
                  items={[["assignee", "Assignee"]]}
                  selected={form.escalation_rules?.assignee ? ["assignee"] : []}
                  onToggle={() =>
                    setForm((old) => ({
                      ...old,
                      escalation_rules: {
                        ...(old.escalation_rules || {}),
                        assignee: !old.escalation_rules?.assignee,
                      },
                    }))
                  }
                />
                <p className="mb-2 mt-3 text-xs font-semibold text-slate-600">
                  Escalate to roles after SLA
                </p>
                <FieldChecks
                  items={roles}
                  selected={form.escalation_rules?.roles || []}
                  onToggle={(role) => toggleRuleRole("escalation_rules", role)}
                />
                <p className="mb-2 mt-3 text-xs font-semibold text-slate-600">
                  Escalate to departments
                </p>
                <FieldChecks
                  items={(data.departments || []).map((item) => [
                    item.id,
                    item.department_name,
                  ])}
                  selected={form.escalation_rules?.departments || []}
                  onToggle={(value) =>
                    setForm((old) => ({
                      ...old,
                      escalation_rules: {
                        ...(old.escalation_rules || {}),
                        departments: toggle(
                          old.escalation_rules?.departments || [],
                          value,
                        ),
                      },
                    }))
                  }
                />
              </div>
            </section>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setEditing(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton disabled={saving}>
                {saving ? "Saving…" : "Save Workflow"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

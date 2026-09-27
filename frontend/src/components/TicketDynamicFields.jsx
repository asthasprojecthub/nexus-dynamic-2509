import React from "react";
import { Field, Input, Select, Textarea } from "./ui";
import { ticketCoreOptions } from "../utils/ticketFormOptions";

export const ticketFieldVisible = (field, values = {}) => {
  const condition = field?.condition;
  if (!condition?.field_key) return true;
  const actual = values[condition.field_key];
  if (condition.operator === "not_equals")
    return String(actual ?? "") !== String(condition.value ?? "");
  if (condition.operator === "includes")
    return Array.isArray(actual)
      ? actual.includes(condition.value)
      : String(actual ?? "").includes(String(condition.value ?? ""));
  return String(actual ?? "") === String(condition.value ?? "");
};

const masterLabels = (data, category, ticketFormVersionId) => {
  const versions = data.ticketMaster?.versions || [];
  const version = ticketFormVersionId
    ? versions.find((item) => item.id === ticketFormVersionId) || null
    : versions.find((item) => item.is_active);
  return ticketCoreOptions(version?.sections || [])[category] || [];
};

export default function TicketDynamicFields({
  fields = [],
  values = {},
  onChange,
  data,
  onFilesChange,
  readOnly = false,
  ticketFormVersionId = "",
}) {
  const visible = fields.filter((field) => ticketFieldVisible(field, values));
  const set = (key, value) => onChange?.({ ...values, [key]: value });
  if (!visible.length)
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
        No fields are configured for this status.
      </p>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {visible.map((field) => {
        const value =
          values[field.key] ?? (field.type === "multiselect" ? [] : "");
        const wide = field.type === "multiselect";
        let control;
        if (readOnly) {
          const display = Array.isArray(value)
            ? value.join(", ")
            : String(value || "—");
          control = (
            <div className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {display}
            </div>
          );
        } else if (field.type === "textarea")
          control = (
            <Textarea
              rows={3}
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            />
          );
        else if (field.type === "dropdown")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select</option>
              {(field.options || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          );
        else if (field.type === "multiselect")
          control = (
            <select
              multiple
              value={value}
              onChange={(e) =>
                set(
                  field.key,
                  Array.from(e.target.selectedOptions).map(
                    (option) => option.value,
                  ),
                )
              }
              className="min-h-24 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
            >
              {(field.options || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          );
        else if (field.type === "yesno")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
            </Select>
          );
        else if (field.type === "user")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select user</option>
              {(data.users || [])
                .filter((item) => item.is_active !== false)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
            </Select>
          );
        else if (field.type === "department")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select department</option>
              {(data.departments || [])
                .filter((item) => item.is_active !== false)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.department_name}
                  </option>
                ))}
            </Select>
          );
        else if (field.type === "vendor")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select vendor</option>
              {masterLabels(data, "VENDOR", ticketFormVersionId).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          );
        else if (field.type === "product")
          control = (
            <Select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">Select product type</option>
              {masterLabels(data, "PRODUCT_TYPE", ticketFormVersionId).map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </Select>
          );
        else if (field.type === "file")
          control = (
            <div>
              <Input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  onFilesChange?.(field.key, files);
                  set(
                    field.key,
                    files.map((file) => file.name),
                  );
                }}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Up to 10 files per status update.
              </p>
            </div>
          );
        else
          control = (
            <Input
              type={
                field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : "text"
              }
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
            />
          );
        return (
          <div key={field.key} className={wide ? "sm:col-span-2" : ""}>
            <Field label={field.label || field.key} required={field.required}>
              {control}
            </Field>
          </div>
        );
      })}
    </div>
  );
}

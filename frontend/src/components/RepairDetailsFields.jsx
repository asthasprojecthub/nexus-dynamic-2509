import React, { useMemo } from "react";
import { Building2, IndianRupee, Phone, UserRound } from "lucide-react";
import { Field, Input, Select } from "./ui";

/**
 * Ticket - Phase 2 : "Repairing should be done by"
 *
 *  - In-house / Store                        -> Department, then Employee(s) of that department
 *  - Local Repairer / OEM-Vendor / Customer Site -> Company name, 10-digit Contact number, Payment amount
 *
 * Controlled component. `value` shape:
 *   { repair_location, department_ids: [], user_ids: [], repair_details: { company_name, contact_number, payment_amount } }
 *
 * Use `validateRepairValue(value)` before submit and `buildPhase2Payload(value)` to get the
 * fields the backend `PUT /api/tickets/:id/phase-2` expects.
 */

export const EMPTY_REPAIR_VALUE = {
  repair_location: "",
  department_ids: [],
  user_ids: [],
  repair_details: { company_name: "", contact_number: "", payment_amount: "" },
};

export const isInHouseRepair = (location) =>
  /in[\s-]?house|store/i.test(String(location || ""));

export const externalNameLabel = (location) => {
  const text = String(location || "");
  if (/vendor|oem/i.test(text)) return "Vendor / OEM Company Name";
  if (/local/i.test(text)) return "Local Repairer / Company Name";
  if (/customer|site/i.test(text)) return "Customer Site / Company Name";
  return "Company Name";
};

const digitsOnly = (text) => String(text || "").replace(/\D/g, "").slice(0, 10);

export function validateRepairValue(value = EMPTY_REPAIR_VALUE) {
  if (!value.repair_location) return "Select who should do the repairing.";
  if (isInHouseRepair(value.repair_location)) {
    if (!value.department_ids?.length) return "Choose the department.";
    if (!value.user_ids?.length) return "Choose at least one employee.";
    return "";
  }
  const details = value.repair_details || {};
  if (!String(details.company_name || "").trim())
    return `${externalNameLabel(value.repair_location)} is required.`;
  if (!/^\d{10}$/.test(String(details.contact_number || "")))
    return "Contact number must be exactly 10 digits.";
  const amount = String(details.payment_amount ?? "").trim();
  if (amount !== "" && (!Number.isFinite(Number(amount)) || Number(amount) < 0))
    return "Payment amount must be 0 or more.";
  return "";
}

export function buildPhase2Payload(value = EMPTY_REPAIR_VALUE) {
  const inHouse = isInHouseRepair(value.repair_location);
  const details = value.repair_details || {};
  return {
    repair_location: value.repair_location,
    department_ids: inHouse ? value.department_ids || [] : [],
    user_ids: inHouse ? value.user_ids || [] : [],
    repair_details: inHouse
      ? { mode: "IN_HOUSE" }
      : {
          mode: "EXTERNAL",
          company_name: String(details.company_name || "").trim(),
          contact_number: digitsOnly(details.contact_number),
          payment_amount:
            String(details.payment_amount ?? "").trim() === ""
              ? null
              : Number(details.payment_amount),
        },
  };
}

export default function RepairDetailsFields({
  value = EMPTY_REPAIR_VALUE,
  onChange,
  repairOptions = [],
  departments = [],
  users = [],
  readOnly = false,
}) {
  const inHouse = isInHouseRepair(value.repair_location);
  const details = value.repair_details || {};
  const departmentId = value.department_ids?.[0] || "";
  const department = departments.find((item) => item.id === departmentId);

  // users[].departments is a list of department NAMES (see /api/bootstrap)
  const employees = useMemo(
    () =>
      !department
        ? []
        : users.filter(
            (user) =>
              user.is_active !== false &&
              (user.departments || []).includes(department.department_name),
          ),
    [users, department],
  );

  const patch = (next) => onChange?.({ ...value, ...next });
  const patchDetails = (next) =>
    patch({ repair_details: { ...details, ...next } });

  const chooseLocation = (location) =>
    // switching the mode clears the other mode's data
    onChange?.({
      ...EMPTY_REPAIR_VALUE,
      repair_location: location,
      department_ids: isInHouseRepair(location) ? value.department_ids || [] : [],
      user_ids: isInHouseRepair(location) ? value.user_ids || [] : [],
    });

  const chooseDepartment = (id) => patch({ department_ids: id ? [id] : [], user_ids: [] });
  const toggleEmployee = (id) =>
    patch({
      user_ids: value.user_ids?.includes(id)
        ? value.user_ids.filter((item) => item !== id)
        : [...(value.user_ids || []), id],
    });

  const phone = String(details.contact_number || "");
  const phoneInvalid = phone.length > 0 && phone.length !== 10;

  return (
    <div className="space-y-4">
      <Field label="Repairing should be done by" required>
        <Select
          required
          disabled={readOnly}
          value={value.repair_location || ""}
          onChange={(event) => chooseLocation(event.target.value)}
        >
          <option value="">Select</option>
          {repairOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      {value.repair_location && inHouse && (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          <Field label="Department" required>
            <Select
              required
              disabled={readOnly}
              value={departmentId}
              onChange={(event) => chooseDepartment(event.target.value)}
            >
              <option value="">Select department</option>
              {departments
                .filter((item) => item.is_active !== false)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.department_name}
                  </option>
                ))}
            </Select>
          </Field>

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <UserRound size={14} /> Employee(s)
              <span className="text-rose-500"> *</span>
            </p>
            {!departmentId ? (
              <p className="rounded-lg border border-dashed bg-white p-3 text-xs text-slate-400">
                Choose a department to see its employees.
              </p>
            ) : employees.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-white p-3 text-xs text-slate-400">
                No active employees found in this department.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {employees.map((user) => {
                  const checked = value.user_ids?.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm ${checked ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200"} ${readOnly ? "pointer-events-none opacity-80" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={() => toggleEmployee(user.id)}
                      />
                      <span className="truncate">{user.full_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {value.repair_location && !inHouse && (
        <div className="grid gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={externalNameLabel(value.repair_location)} required>
              <div className="relative">
                <Building2 size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <Input
                  required
                  className="pl-9"
                  maxLength={160}
                  disabled={readOnly}
                  value={details.company_name || ""}
                  onChange={(event) => patchDetails({ company_name: event.target.value })}
                  placeholder="Company / repairer name"
                />
              </div>
            </Field>
          </div>

          <div>
            <Field label="Contact Number (10 digits)" required>
              <div className="relative">
                <Phone size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <Input
                  required
                  className={`pl-9 ${phoneInvalid ? "border-rose-400" : ""}`}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  pattern="[0-9]{10}"
                  title="Enter exactly 10 digits"
                  disabled={readOnly}
                  value={phone}
                  onChange={(event) => patchDetails({ contact_number: digitsOnly(event.target.value) })}
                  placeholder="9876543210"
                />
              </div>
            </Field>
            {phoneInvalid && (
              <p className="mt-1 text-xs text-rose-600">
                Enter exactly 10 digits ({phone.length}/10).
              </p>
            )}
          </div>

          <Field label="Payment Amount">
            <div className="relative">
              <IndianRupee size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <Input
                className="pl-9"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                disabled={readOnly}
                value={details.payment_amount ?? ""}
                onChange={(event) => patchDetails({ payment_amount: event.target.value })}
                placeholder="0.00"
              />
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

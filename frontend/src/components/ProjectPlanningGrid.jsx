import React, { useMemo } from "react";
import { CalendarDays, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { Input, Select } from "./ui";

const DEFAULT_STATUSES = [
  "Pending",
  "In Progress",
  "Delay",
  "Completed",
  "On Hold",
];

const STATUS_ROW = {
  Pending: "bg-white hover:bg-slate-50",
  "In Progress": "bg-amber-50/70 hover:bg-amber-100/60",
  Delay: "bg-rose-50/80 hover:bg-rose-100/60",
  Completed: "bg-emerald-50/80 hover:bg-emerald-100/60",
  "On Hold": "bg-violet-50/70 hover:bg-violet-100/60",
};

const STATUS_SELECT = {
  Pending: "border-slate-300 bg-white text-slate-700",
  "In Progress": "border-amber-200 bg-amber-50 text-amber-800",
  Delay: "border-rose-200 bg-rose-50 text-rose-700",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "On Hold": "border-violet-200 bg-violet-50 text-violet-700",
};

const iso = (value) => {
  if (!value) return "";
  const dateOnly = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (start, days) => {
  if (!start) return "";
  const count = Number(days);
  if (!Number.isSafeInteger(count) || count < 1) return "";
  const parts = String(start).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part)))
    return "";
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
};

const deriveDays = (row, start, end) => {
  const directDays = Number.parseInt(
    row.days ?? row.totalDays ?? row.duration,
    10,
  );
  if (Number.isFinite(directDays) && directDays > 0) return directDays;
  const legacyWeeks = Number.parseInt(
    row.timeline_weeks ?? row.timelineWeeks,
    10,
  );
  if (Number.isFinite(legacyWeeks) && legacyWeeks > 0) return legacyWeeks * 7;
  if (start && end) {
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s) {
      return Math.max(
        1,
        Math.ceil((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)),
      );
    }
  }
  return "";
};

const delayedDays = (row) => {
  const expected = row.expected_end_date || row.planned_end || "";
  if (!expected) return 0;
  const expectedDate = new Date(`${expected}T00:00:00`);
  if (Number.isNaN(expectedDate.getTime())) return 0;
  const actual = row.actual_end_date || row.actual_end || "";
  const compare = actual ? new Date(`${actual}T00:00:00`) : new Date();
  compare.setHours(0, 0, 0, 0);
  if (Number.isNaN(compare.getTime()) || compare <= expectedDate) return 0;
  if (row.status === "Completed" && !actual) return 0;
  return Math.max(
    0,
    Math.floor(
      (compare.getTime() - expectedDate.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
};

export const normalizePlanningRow = (row, index = 0) => {
  const start = iso(
    row.start_date ||
      row.planned_start ||
      row.plannedStartDate ||
      row.startDate,
  );
  const oldEnd = iso(
    row.expected_end_date ||
      row.planned_end ||
      row.plannedEndDate ||
      row.endDate,
  );
  const days = deriveDays(row, start, oldEnd);
  const expected = start && days ? addDays(start, days) : "";
  const weeks = days ? Math.max(1, Math.ceil(Number(days) / 7)) : "";
  const actualEnd = iso(
    row.actual_end_date || row.actual_end || row.actualEnd || row.actualEndDate,
  );
  return {
    ...row,
    id: row.id || `planning-${Date.now()}-${index}`,
    panel: row.panel || "General",
    panel_key: row.panel_key || row.panel || "General",
    department: row.department || "General",
    task_id: row.task_id || row.taskId || "",
    task: row.task || row.taskName || "",
    remark: row.remark || row.remarks || "",
    assigned_to:
      typeof row.assigned_to === "object"
        ? row.assigned_to?.full_name || row.assigned_to?.name || ""
        : row.assigned_to || row.assignedTo || "",
    start_date: start,
    timeline_weeks: weeks,
    expected_end_date: expected,
    actual_end_date: actualEnd,
    // Keep aliases for older activity/progress code and existing API payloads.
    days: days || "",
    planned_start: start,
    planned_end: expected,
    actual_end: actualEnd,
    status: row.status === "Planned" ? "Pending" : row.status || "Pending",
  };
};

export function validatePlanningTimelines(rows = []) {
  // Planning task details are intentionally optional when a grid is created.
  // A project can be saved first and Days / Start Date / other task details can be filled later.
  // End Date is calculated only when both Start Date and Days are available.
  return "";
}

export function planningProgress(rows = []) {
  const normalized = rows.map(normalizePlanningRow);
  if (!normalized.length) return 0;
  const completed = normalized.filter(
    (row) => row.status === "Completed",
  ).length;
  return Math.round((completed / normalized.length) * 100);
}

export function syncPlanningRows(
  currentRows = [],
  departments = [],
  panels = [],
  planningMaster = {},
) {
  const existing = currentRows.map(normalizePlanningRow);
  const taskMap = planningMaster.department_tasks || {};
  const activePanels = panels?.length ? panels : [];
  const next = [];
  const usedExistingIds = new Set();
  if (!departments?.length || !activePanels.length) return next;

  const taskMatches = (row, department, taskId, taskName) =>
    row.department === department &&
    ((taskId && row.task_id === taskId) || row.task === taskName);

  const activeBaseKeys = new Set();

  activePanels.forEach((panel) => {
    const fallbackLabel = panel.panel_no
      ? `${panel.panel_no} · ${panel.panel || panel.panel_type || "Panel"}`
      : panel.panel || panel.panel_type || "General";
    const panelLabel = panel.planning_label || fallbackLabel;
    const panelKey =
      panel.planning_key ||
      panel.panel_id ||
      panel.panel_master_id ||
      panel.panel_no ||
      fallbackLabel;
    const basePanelKey =
      panel.planning_base_key ||
      panel.panel_id ||
      panel.panel_master_id ||
      panel.panel_no ||
      fallbackLabel;
    activeBaseKeys.add(String(basePanelKey));

    departments.forEach((department) => {
      const tasks = taskMap[department] || [];
      tasks.forEach((task, taskIndex) => {
        const taskId = typeof task === "string" ? task : task.id;
        const taskName = typeof task === "string" ? task : task.name;

        let found = existing.find(
          (row) =>
            !row.manual_grid &&
            !usedExistingIds.has(row.id) &&
            taskMatches(row, department, taskId, taskName) &&
            String(row.panel_key || row.panel) === String(panelKey),
        );

        if (!found) {
          found = existing.find(
            (row) =>
              !row.manual_grid &&
              !usedExistingIds.has(row.id) &&
              taskMatches(row, department, taskId, taskName) &&
              (String(row.panel_key || "") === String(basePanelKey) ||
                String(row.panel_key || "") === String(panel.panel_id || "") ||
                String(row.panel || "").startsWith(
                  String(panel.panel_no || "__no_panel_no__"),
                )),
          );
        }

        if (found) {
          usedExistingIds.add(found.id);
          next.push({
            ...found,
            panel: panelLabel,
            panel_key: panelKey,
            planning_base_key: basePanelKey,
            planning_group_id: panel.planning_group_id || "",
            planning_group_qty: panel.planning_group_qty || panel.qty || 1,
            planning_grid_no: panel.planning_grid_no || 1,
            task_id: taskId || found.task_id,
            task: taskName,
          });
          return;
        }

        next.push(
          normalizePlanningRow(
            {
              id: `pg-${panelKey}-${department}-${taskId || taskIndex}-${Date.now()}`,
              panel: panelLabel,
              panel_key: panelKey,
              planning_base_key: basePanelKey,
              planning_group_id: panel.planning_group_id || "",
              planning_group_qty: panel.planning_group_qty || panel.qty || 1,
              planning_grid_no: panel.planning_grid_no || 1,
              department,
              task_id: taskId || "",
              task: taskName,
              remark: "",
              assigned_to: "",
              start_date: "",
              timeline_weeks: "",
              days: "",
              expected_end_date: "",
              actual_end_date: "",
              status: "Pending",
            },
            taskIndex,
          ),
        );
      });
    });
  });

  // Preserve extra planning grids added for a specific panel + department.
  // They remain independent while still receiving task-definition changes
  // from the active Planning Grid Master version.
  const manualGroups = new Map();
  existing
    .filter((row) => row.manual_grid)
    .forEach((row) => {
      if (!departments.includes(row.department)) return;
      const baseKey = String(row.planning_base_key || "");
      if (!activeBaseKeys.has(baseKey)) return;
      const key = `${row.panel_key}__${row.department}`;
      if (!manualGroups.has(key))
        manualGroups.set(key, {
          rows: [],
          department: row.department,
          panel_key: row.panel_key,
          planning_base_key: row.planning_base_key,
          panel: row.panel,
          manual_grid_no: row.manual_grid_no || 2,
          manual_base_label: row.manual_base_label || row.panel,
        });
      manualGroups.get(key).rows.push(row);
    });

  manualGroups.forEach((group) => {
    const tasks = taskMap[group.department] || [];
    tasks.forEach((task, taskIndex) => {
      const taskId = typeof task === "string" ? task : task.id;
      const taskName = typeof task === "string" ? task : task.name;
      const found = group.rows.find(
        (row) => (taskId && row.task_id === taskId) || row.task === taskName,
      );
      if (found) {
        next.push({
          ...found,
          task_id: taskId || found.task_id,
          task: taskName,
          manual_grid: true,
        });
      } else {
        next.push(
          normalizePlanningRow(
            {
              id: `pg-manual-${group.panel_key}-${group.department}-${taskId || taskIndex}-${Date.now()}`,
              panel: group.panel,
              panel_key: group.panel_key,
              planning_base_key: group.planning_base_key,
              department: group.department,
              task_id: taskId || "",
              task: taskName,
              manual_grid: true,
              manual_grid_no: group.manual_grid_no,
              manual_base_label: group.manual_base_label,
              remark: "",
              assigned_to: "",
              start_date: "",
              days: "",
              expected_end_date: "",
              actual_end_date: "",
              status: "Pending",
            },
            taskIndex,
          ),
        );
      }
    });
  });

  return next;
}

export default function ProjectPlanningGrid({
  rows = [],
  onChange,
  users = [],
  statuses = DEFAULT_STATUSES,
  readOnly = false,
  compact = false,
  getRowAccess,
  onTaskChange,
  savingRowId = "",
}) {
  const normalized = useMemo(() => rows.map(normalizePlanningRow), [rows]);
  const groups = useMemo(() => {
    const map = new Map();
    normalized.forEach((row) => {
      const key = `${row.panel_key || row.panel}__${row.department}`;
      if (!map.has(key))
        map.set(key, {
          panel_key: row.panel_key || row.panel,
          planning_base_key:
            row.planning_base_key || row.panel_key || row.panel,
          panel: row.panel,
          department: row.department,
          manual_grid: !!row.manual_grid,
          manual_grid_no: row.manual_grid_no || 1,
          manual_base_label: row.manual_base_label || row.panel,
          rows: [],
        });
      map.get(key).rows.push(row);
    });
    return [...map.values()];
  }, [normalized]);

  const setRow = (id, patch) => {
    if (readOnly || !onChange) return;
    const next = normalized.map((row) => {
      if (row.id !== id) return row;
      const merged = { ...row, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "days")) {
        const nextDays = Number(merged.days);
        merged.days =
          merged.days !== "" && Number.isSafeInteger(nextDays) && nextDays > 0
            ? nextDays
            : "";
        merged.timeline_weeks = merged.days
          ? Math.max(1, Math.ceil(Number(merged.days) / 7))
          : "";
        merged.expected_end_date =
          merged.start_date && merged.days
            ? addDays(merged.start_date, merged.days)
            : "";
      }
      if (Object.prototype.hasOwnProperty.call(patch, "start_date")) {
        merged.expected_end_date =
          merged.start_date && merged.days
            ? addDays(merged.start_date, merged.days)
            : "";
      }
      merged.planned_start = merged.start_date;
      merged.planned_end = merged.expected_end_date;
      merged.actual_end = merged.actual_end_date || "";
      return merged;
    });
    onChange(next);
  };

  const addDepartmentGrid = (group) => {
    if (readOnly || !onChange) return;
    const baseKey = group.planning_base_key || group.panel_key;
    const baseLabel = group.manual_base_label || group.panel;
    const siblings = groups.filter(
      (item) =>
        String(item.planning_base_key || item.panel_key) === String(baseKey) &&
        item.department === group.department,
    );
    const nextNo =
      Math.max(1, ...siblings.map((item) => Number(item.manual_grid_no || 1))) +
      1;
    const safeDepartment = String(group.department || "department")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const newPanelKey = `${baseKey}::dept-${safeDepartment}::grid-${Date.now()}`;
    const cloned = group.rows.map((row, index) =>
      normalizePlanningRow(
        {
          ...row,
          id: `pg-extra-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
          panel: `${baseLabel} · Grid ${nextNo}`,
          panel_key: newPanelKey,
          planning_base_key: baseKey,
          manual_grid: true,
          manual_grid_no: nextNo,
          manual_base_label: baseLabel,
          remark: "",
          assigned_to: "",
          start_date: "",
          planned_start: "",
          timeline_weeks: "",
          days: "",
          expected_end_date: "",
          planned_end: "",
          actual_end_date: "",
          actual_end: "",
          status: "Pending",
        },
        index,
      ),
    );
    onChange([...normalized, ...cloned]);
  };

  const removeDepartmentGrid = (group) => {
    if (readOnly || !onChange || !group.manual_grid) return;
    onChange(
      normalized.filter(
        (row) =>
          !(
            String(row.panel_key) === String(group.panel_key) &&
            row.department === group.department
          ),
      ),
    );
  };

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <LockKeyhole size={22} className="mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">
          Planning grid will appear here.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Select project departments and panels. Tasks are loaded from Planning
          Grid Master.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {groups.map((group) => {
        const currentlyAssigned = new Set(
          group.rows.map((row) => row.assigned_to).filter(Boolean),
        );
        const departmentUsers = users.filter(
          (user) =>
            user.departments?.includes(group.department) ||
            currentlyAssigned.has(user.full_name),
        );
        const groupAccess = getRowAccess?.(group.rows[0]) || {};
        const canManageGroup =
          !readOnly &&
          !!onChange &&
          (!getRowAccess || groupAccess.canEditDetails === true);
        const done = group.rows.filter(
          (row) => row.status === "Completed",
        ).length;
        const pct = group.rows.length
          ? Math.round((done / group.rows.length) * 100)
          : 0;

        return (
          <section
            key={`${group.panel_key}-${group.department}`}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">
                    {group.department}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">
                    {group.panel}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {group.rows.length} master task
                  {group.rows.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-slate-600">
                {canManageGroup && (
                  <button
                    type="button"
                    onClick={() => addDepartmentGrid(group)}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50"
                    title="Add another independent planning grid for this panel and department"
                  >
                    <Plus size={12} /> Add Planning Grid
                  </button>
                )}
                {canManageGroup && group.manual_grid && (
                  <button
                    type="button"
                    onClick={() => removeDepartmentGrid(group)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                    title="Remove this extra planning grid"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span>{pct}%</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] table-fixed text-[11px]">
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[7%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[5%]" />
                  <col className="w-[5%]" />
                </colgroup>
                <thead className="bg-slate-800 text-white">
                  <tr>
                    {[
                      "Sr.",
                      "Task Name",
                      "Remark",
                      "Assigned To",
                      "Days",
                      "Start Date",
                      "End Date",
                      "Status",
                      "Delay",
                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap px-1.5 py-2 text-center text-[10px] font-semibold first:text-left"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, index) => {
                    const delay = delayedDays(row);
                    const rowAccess = getRowAccess?.(row) || {};
                    const rowSaving = String(savingRowId) === String(row.id);
                    const canEditRow =
                      !readOnly &&
                      !!onChange &&
                      (!getRowAccess || rowAccess.canEditDetails === true);
                    const canAssign =
                      canEditRow ||
                      (!!onTaskChange && rowAccess.canAssign === true);
                    const canChangeStatus =
                      canEditRow ||
                      (!!onTaskChange && rowAccess.canChangeStatus === true);
                    const rawStatus = statuses.includes(row.status)
                      ? row.status
                      : statuses[0] || "Pending";
                    const status =
                      delay > 0 &&
                      !["Completed", "On Hold"].includes(rawStatus) &&
                      statuses.includes("Delay")
                        ? "Delay"
                        : rawStatus;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-slate-200 align-middle transition ${STATUS_ROW[status] || STATUS_ROW.Pending}`}
                      >
                        <td className="px-1.5 py-1.5 text-center font-semibold text-slate-500">
                          {index + 1}
                        </td>
                        <td className="px-1 py-1.5">
                          <div
                            className="min-h-7 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold leading-4 text-slate-800"
                            title="Task names are controlled by Planning Grid Master"
                          >
                            {row.task || "—"}
                          </div>
                        </td>
                        <td className="px-1 py-1.5">
                          <Input
                            value={row.remark}
                            disabled={!canEditRow}
                            onChange={(e) =>
                              setRow(row.id, { remark: e.target.value })
                            }
                            placeholder="Remark"
                            className="!h-8 !rounded-md !px-2 !py-1 !text-[11px]"
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Select
                            value={row.assigned_to}
                            disabled={!canAssign || rowSaving}
                            onChange={(e) => {
                              const assigned_to = e.target.value;
                              if (readOnly)
                                onTaskChange?.(row, { assigned_to });
                              else setRow(row.id, { assigned_to });
                            }}
                            className="!h-8 !rounded-md !px-2 !py-1 !text-[11px]"
                          >
                            <option value="">Assign user</option>
                            {departmentUsers.map((user) => (
                              <option key={user.id} value={user.full_name}>
                                {user.full_name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-1 py-1.5">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.days}
                            disabled={!canEditRow}
                            onKeyDown={(e) => {
                              if ([".", ","].includes(e.key))
                                e.preventDefault();
                            }}
                            onChange={(e) => {
                              if (/^\d*$/.test(e.target.value))
                                setRow(row.id, { days: e.target.value });
                            }}
                            className="!h-8 !rounded-md !px-2 !py-1 !text-center !text-[11px]"
                            title="Enter a positive whole number of days"
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Input
                            type="date"
                            value={row.start_date}
                            disabled={!canEditRow}
                            onChange={(e) =>
                              setRow(row.id, { start_date: e.target.value })
                            }
                            className="!h-8 !rounded-md !px-1 !py-1 !text-[10px]"
                            title="Select the task start date"
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Input
                            type="date"
                            value={row.expected_end_date}
                            disabled
                            className="!h-8 !rounded-md !bg-slate-100 !px-1 !py-1 !text-[10px] !text-slate-600"
                            title="Calculated automatically from Start Date + Days"
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Select
                            value={status}
                            disabled={!canChangeStatus || rowSaving}
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              if (readOnly)
                                onTaskChange?.(row, { status: nextStatus });
                              else setRow(row.id, { status: nextStatus });
                            }}
                            className={`!h-8 !rounded-md !px-1.5 !py-1 !text-[10px] ${STATUS_SELECT[status] || ""}`}
                          >
                            {statuses.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td
                          className={`px-1 py-1.5 text-center text-xs font-bold ${delay > 0 ? "text-rose-600" : "text-slate-400"}`}
                        >
                          {delay > 0 ? `${delay}d` : "—"}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <span
                            className="inline-flex rounded-md p-1.5 text-slate-300"
                            title="Fixed grid structure is controlled by the system"
                          >
                            <LockKeyhole size={13} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
        <CalendarDays size={13} className="shrink-0" /> Select Start Date
        manually and enter positive whole Days. End Date changes automatically;
        Start Date never changes when Days is edited. Passed End Dates show the
        delayed days.
      </div>
    </div>
  );
}

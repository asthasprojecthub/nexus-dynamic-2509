import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  FolderKanban,
  ListChecks,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { api } from "../api";
import {
  Field,
  Input,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  Select,
  Status,
} from "../components/ui";
import DynamicForm, { validateDynamicForm } from "../components/DynamicForm";
import ProjectPlanningGrid, {
  planningProgress,
  syncPlanningRows,
  validatePlanningTimelines,
} from "../components/ProjectPlanningGrid";
import { planningScopes } from "../components/ProjectActivityGraph";
import RecordDocuments from "../components/RecordDocuments";
import { DetailHeader, Info, SectionDataView } from "../components/RecordUI";
import { ProjectMeetings } from "../components/MeetingSections";
import FixedTimelineFields, {
  addTimelineWeeks,
  timelineWeeksFromDates,
} from "../components/FixedTimelineFields";
import {
  collectDynamicDocumentDrafts,
  sanitizeDynamicDocumentValues,
  uploadDynamicDocumentDrafts,
} from "../utils/dynamicDocuments";
import ProjectQuantityPlanning, {
  expandPanelsForPlanning,
  normalizeProjectPanel,
  normalizeProjectPanels,
  setProjectPanelQty,
  validateProjectPanelPlanning,
} from "../components/ProjectQuantityPlanning";

const PROJECT_STATUSES = ["Planning", "In Progress", "Hold", "Completed"];
const accessName = (value) => String(value || "").trim().toUpperCase();
const newPanel = (index = 0) =>
  normalizeProjectPanel(
    {
      _key: `p-${Date.now()}-${index}-${Math.random()}`,
      panel_id: "",
      panel_no: `P-${String(index + 1).padStart(2, "0")}`,
      panel: "",
      qty: 1,
    },
    index,
  );

function ProjectToolbar({
  record,
  scopes,
  selectedScope,
  onScopeChange,
  onRefresh,
  onActivity,
  onCopy,
  copying,
}) {
  const currentIndex = Math.max(
    0,
    scopes.findIndex((scope) => scope.key === selectedScope),
  );
  const move = (delta) => {
    if (!scopes.length) return;
    const next = Math.max(0, Math.min(scopes.length - 1, currentIndex + delta));
    onScopeChange(scopes[next].key);
  };
  const jump = (id) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
            Refresh
          </SecondaryButton>
          <SecondaryButton type="button" onClick={onActivity}>
            <Activity size={15} />
            Activity
          </SecondaryButton>
          {onCopy && (
            <SecondaryButton
              type="button"
              onClick={onCopy}
              disabled={copying || record?.project_locked}
            >
              <Copy size={15} />
              {copying ? "Copying…" : "Copy"}
            </SecondaryButton>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => jump("project-details")}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-white"
          >
            1 Details
          </button>
          <button
            type="button"
            onClick={() => jump("project-planning")}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
          >
            2 Planning
          </button>
          <button
            type="button"
            onClick={() => jump("project-documents")}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
          >
            3 Documents
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!scopes.length || currentIndex <= 0}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-500 disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Prev
        </button>
        <span className="min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
          {scopes.length
            ? `${currentIndex + 1}. ${scopes[currentIndex]?.department} - ${scopes[currentIndex]?.panel}`
            : "No planning grid"}
        </span>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={!scopes.length || currentIndex >= scopes.length - 1}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-500 disabled:opacity-40"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({ editable = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, update, refresh } = useStore();
  const permissions = new Set(data.currentUser?.permissions || []);
  const canCreate = permissions.has('PROJECTS.CREATE');
  const hasUpdatePermission = permissions.has('PROJECTS.UPDATE');
  const canAssignPlanningTasks = permissions.has('PROJECTS.PLANNING_GRID');
  const canUpdatePlanningStatus = permissions.has('PROJECTS.UPDATE_COMPLETION');
  const record = useMemo(
    () => (data.projects || []).find((project) => project.id === id),
    [data.projects, id],
  );
  const canUpdate = hasUpdatePermission && record?.can_edit !== false;
  const canEditDocuments = hasUpdatePermission || permissions.has('PROJECTS.UPLOAD_DOCUMENTS');
  const version = useMemo(() => {
    const versions = data.projectMaster?.versions || [];
    return record?.project_master_version_id
      ? versions.find((item) => item.id === record.project_master_version_id) ||
          null
      : versions.find((item) => item.is_active) || null;
  }, [data.projectMaster, record]);
  const planningMaster = useMemo(() => {
    const versions = data.planningGridVersions || [];
    if (record?.planning_grid_version_id) {
      return (
        versions.find(
          (item) => item.id === record.planning_grid_version_id,
        ) || {
          id: record.planning_grid_version_id,
          statuses: [
            ...new Set(
              (record.planning_grid || [])
                .map((row) => row.status)
                .filter(Boolean),
            ),
          ],
          department_tasks: {},
        }
      );
    }
    return data.planningGridMaster || { statuses: [], department_tasks: {} };
  }, [data.planningGridMaster, data.planningGridVersions, record]);
  const statuses = planningMaster.statuses?.length
    ? planningMaster.statuses
    : ["Pending", "In Progress", "Delay", "Completed", "On Hold"];
  const departments = (data.departments || []).filter(
    (department) => department.is_active !== false,
  );
  const panels = (data.panelMasters || []).filter(
    (panel) => panel.is_active !== false,
  );
  const customers = (data.customers || []).filter(
    (customer) => customer.is_active !== false,
  );
  const isDirect =
    !record?.source_inquiry || record.source_inquiry === "Direct";
  const recordPanels = useMemo(
    () => normalizeProjectPanels(record?.panels || []),
    [record],
  );
  const panelParam = searchParams.get("panel") || "";
  const selectedPanel = useMemo(() => {
    if (!recordPanels.length) return null;
    return (
      recordPanels.find(
        (panel, index) =>
          String(panel.planning_key || panel.panel_no || index) === panelParam,
      ) || recordPanels[0]
    );
  }, [recordPanels, panelParam]);
  const selectedPanelKey = selectedPanel
    ? String(
        selectedPanel.planning_key ||
          selectedPanel.panel_no ||
          recordPanels.indexOf(selectedPanel),
      )
    : "";

  const [form, setForm] = useState(() =>
    record
      ? {
          customer_id: record.customer_id || "",
          project_name: record.project_name || "",
          status: record.status || "Planning",
          start_date: record.start_date || "",
          timeline_weeks:
            record.timeline_weeks ||
            timelineWeeksFromDates(
              record.start_date || "",
              record.expected_end_date || record.target_end_date || "",
            ),
          expected_end_date:
            record.expected_end_date || record.target_end_date || "",
          actual_end_date: record.actual_end_date || "",
          departments: [...(record.departments || [])],
          panels: normalizeProjectPanels(
            JSON.parse(JSON.stringify(record.panels || [])),
          ),
          planning_grid: JSON.parse(JSON.stringify(record.planning_grid || [])),
          project_data: JSON.parse(JSON.stringify(record.project_data || {})),
        }
      : null,
  );
  const [directPanels, setDirectPanels] = useState(() =>
    record
      ? normalizeProjectPanels(
          JSON.parse(
            JSON.stringify(
              (record.panels || []).map((panel, index) => ({
                ...panel,
                _key: panel._key || `${panel.panel_id}-${index}`,
              })),
            ),
          ),
        )
      : [],
  );
  const [errors, setErrors] = useState({});
  const initialScopes = planningScopes(record?.planning_grid || []);
  const [selectedScope, setSelectedScope] = useState(
    initialScopes[0]?.key || "",
  );
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState("");
  const [savingPlanningRowId, setSavingPlanningRowId] = useState("");

  if (!record || !form)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Project not found.
      </div>
    );

  if (editable && !canUpdate)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        You do not have permission to edit this project.
      </div>
    );

  const scopeSourceRows = editable
    ? form.planning_grid
    : record.planning_grid || [];
  const allScopes = planningScopes(scopeSourceRows);
  const scopes =
    !editable && selectedPanel && recordPanels.length > 1
      ? allScopes.filter((scope) =>
          scope.rows.some((row) => {
            const base = String(row.planning_base_key || row.panel_key || "");
            return (
              base.includes(selectedPanelKey) ||
              String(row.panel || "").includes(selectedPanel.panel || "")
            );
          }),
        )
      : allScopes;
  const effectiveScope = scopes.some((scope) => scope.key === selectedScope)
    ? selectedScope
    : scopes[0]?.key || "";
  const jumpToScope = (scopeKey) => {
    setSelectedScope(scopeKey);
    const scopeIndex = scopes.findIndex((scope) => scope.key === scopeKey);
    if (scopeIndex < 0) return;
    window.setTimeout(() => {
      document
        .getElementById(`planning-grid-${scopeIndex}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const mergeVisiblePlanningRows = (nextRows) => {
    const byId = new Map((nextRows || []).map((row) => [row.id, row]));
    setForm((current) => ({
      ...current,
      planning_grid: current.planning_grid.map(
        (row) => byId.get(row.id) || row,
      ),
    }));
  };

  const currentRole = accessName(data.currentUser?.role_code);
  const currentUserName = accessName(data.currentUser?.full_name);
  const currentDepartments = new Set(
    (data.currentUser?.departments || []).map(accessName),
  );
  const getPlanningRowAccess = (row) => {
    const isAdmin = currentRole === "ADMIN";
    const isDepartmentLead = ["HOD", "TL"].includes(currentRole);
    const sameDepartment = currentDepartments.has(accessName(row.department));
    const assignedToCurrentUser =
      !!currentUserName && accessName(row.assigned_to) === currentUserName;
    return {
      canEditDetails:
        canAssignPlanningTasks &&
        (isAdmin || (isDepartmentLead && sameDepartment)),
      canAssign:
        canAssignPlanningTasks &&
        (isAdmin || (isDepartmentLead && sameDepartment)),
      canChangeStatus:
        canUpdatePlanningStatus &&
        (isAdmin ||
          (isDepartmentLead && sameDepartment) ||
          assignedToCurrentUser),
    };
  };

  const updatePlanningTask = async (row, patch) => {
    if (!row?.id || savingPlanningRowId) return;
    setSavingPlanningRowId(row.id);
    setActionError("");
    try {
      await api(
        `/projects/${id}/planning-tasks/${encodeURIComponent(row.id)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      await refresh();
    } catch (error) {
      setActionError(error.message || "Unable to update the project task.");
    } finally {
      setSavingPlanningRowId("");
    }
  };

  const copyProject = async () => {
    if (copying) return;
    setCopying(true);
    setActionError("");
    try {
      const created = await api(`/projects/${id}/copy`, { method: "POST" });
      await refresh();
      setCopyConfirm(false);
      navigate(`/projects/${created.id}/edit`);
    } catch (error) {
      setActionError(error.message || "Unable to copy project.");
    } finally {
      setCopying(false);
    }
  };

  const syncGrid = (currentRows, nextDepartments, nextPanels) =>
    syncPlanningRows(
      currentRows,
      nextDepartments,
      expandPanelsForPlanning(nextPanels),
      planningMaster,
    );

  const sync = (nextDepartments = form.departments, nextPanels = form.panels) =>
    setForm((current) => ({
      ...current,
      departments: nextDepartments,
      panels: normalizeProjectPanels(nextPanels),
      planning_grid: syncGrid(
        current.planning_grid,
        nextDepartments,
        nextPanels,
      ),
    }));

  const toggleDepartment = (name) => {
    const next = form.departments.includes(name)
      ? form.departments.filter((item) => item !== name)
      : [...form.departments, name];
    sync(next, form.panels);
  };

  const applyDirectPanels = (entries) => {
    const normalizedEntries = entries.map((entry, index) =>
      normalizeProjectPanel(entry, index),
    );
    setDirectPanels(normalizedEntries);
    const nextPanels = normalizedEntries
      .filter((entry) => entry.panel_id)
      .map((entry, index) => {
        const panelMaster = panels.find((item) => item.id === entry.panel_id);
        return normalizeProjectPanel(
          {
            ...entry,
            panel_id: entry.panel_id,
            panel_no: entry.panel_no || "P-01",
            panel: panelMaster?.panel_type || entry.panel || "",
          },
          index,
        );
      });
    sync(form.departments, nextPanels);
  };

  const updateDirectPanel = (index, patch) => {
    const next = directPanels.map((entry, currentIndex) => {
      if (currentIndex !== index) return entry;
      if (Object.prototype.hasOwnProperty.call(patch, "qty"))
        return setProjectPanelQty({ ...entry, ...patch }, patch.qty);
      return normalizeProjectPanel({ ...entry, ...patch }, index);
    });
    applyDirectPanels(next);
  };

  const replaceDirectPanelPlanning = (index, nextPanel) => {
    applyDirectPanels(
      directPanels.map((entry, currentIndex) =>
        currentIndex === index
          ? normalizeProjectPanel(nextPanel, index)
          : entry,
      ),
    );
  };

  const updateInheritedPanelPlanning = (index, nextPanel) => {
    const nextPanels = form.panels.map((panel, currentIndex) =>
      currentIndex === index ? normalizeProjectPanel(nextPanel, index) : panel,
    );
    sync(form.departments, nextPanels);
  };

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.customer_id) nextErrors.customer_id = "Customer is required.";
    if (!form.project_name.trim())
      nextErrors.project_name = "Project Name is required.";
    if (!form.start_date) nextErrors.start_date = "Start Date is required.";
    if (
      !Number.isFinite(Number(form.timeline_weeks)) ||
      Number(form.timeline_weeks) <= 0
    )
      nextErrors.timeline_weeks =
        "Enter a positive timeline, for example 0.5 or 2 weeks.";
    if (!form.departments.length)
      nextErrors.departments = "Select at least one department.";
    if (!form.panels.length)
      nextErrors.panels = "At least one panel is required.";
    const planningError = validateProjectPanelPlanning(form.panels);
    if (planningError) nextErrors.panel_planning = planningError;
    const timelineError = validatePlanningTimelines(form.planning_grid);
    if (timelineError) nextErrors.planning_timeline = timelineError;
    const dynamicValidation = validateDynamicForm(
      version?.sections || [],
      form.project_data,
    );
    Object.assign(nextErrors, dynamicValidation.errors);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const customer = customers.find((item) => item.id === form.customer_id);
    const progress = planningProgress(form.planning_grid);
    const dynamicDocumentDrafts = collectDynamicDocumentDrafts(
      version?.sections || [],
      form.project_data || {},
    );
    const payload = {
      customer_id: form.customer_id,
      customer: customer?.customer_name || record.customer,
      project_name: form.project_name.trim(),
      status: form.status,
      start_date: form.start_date,
      timeline_weeks: Number(form.timeline_weeks),
      expected_end_date:
        form.expected_end_date ||
        addTimelineWeeks(form.start_date, form.timeline_weeks),
      target_end_date:
        form.expected_end_date ||
        addTimelineWeeks(form.start_date, form.timeline_weeks),
      actual_end_date: form.actual_end_date || "",
      departments: form.departments,
      panels: normalizeProjectPanels(form.panels),
      planning_grid: form.planning_grid,
      progress,
      assignments: [
        ...new Set(
          form.planning_grid.map((row) => row.assigned_to).filter(Boolean),
        ),
      ],
      project_master_version_id:
        record.project_master_version_id || version?.id || null,
      planning_grid_version_id:
        record.planning_grid_version_id || planningMaster?.id || null,
      project_data: sanitizeDynamicDocumentValues(form.project_data || {}),
    };
    setActionError("");
    try {
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (dynamicDocumentDrafts.length)
        await uploadDynamicDocumentDrafts(
          api,
          "project",
          id,
          dynamicDocumentDrafts,
        );
      await refresh();
      navigate("/projects");
    } catch (error) {
      setActionError(
        error.message || "Unable to update project or upload document.",
      );
    }
  };

  if (editable && record.project_locked) {
    return (
      <div className="fade-in mx-auto max-w-[1000px]">
        <DetailHeader
          title={record.project_no}
          subtitle={`Project · ${record.project_name} · Master v${version?.version_no || "—"} · Grid v${planningMaster?.version_no || "—"}`}
          onBack={() => navigate("/projects")}
          editing
        />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-950">
            Project editing is locked
          </h2>
          <p className="mt-2 text-sm text-amber-900">
            {record.project_lock_reason}
          </p>
          {record.inquiry_id && (
            <button
              type="button"
              onClick={() => navigate(`/inquiries/${record.inquiry_id}/view`)}
              className="mt-4 rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Open Source Inquiry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!editable) {
    return (
      <div className="fade-in mx-auto max-w-[1600px]">
        <DetailHeader
          title={record.project_no}
          subtitle={`Project · ${record.project_name} · Master v${version?.version_no || "—"} · Grid v${planningMaster?.version_no || "—"}`}
          onBack={() => navigate("/projects")}
          onEdit={
            record.project_locked || !canUpdate
              ? undefined
              : () => navigate(`/projects/${id}/edit`)
          }
        />
        <ProjectToolbar
          record={record}
          scopes={scopes}
          selectedScope={effectiveScope}
          onScopeChange={jumpToScope}
          onRefresh={refresh}
          onActivity={() => navigate(`/projects/${id}/activity`)}
          copying={copying}
        />
        {record.source_inquiry_amendment && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              <strong>Amendment:</strong>{" "}
              {record.source_inquiry_amendment_message}
            </span>
          </div>
        )}
        {record.project_locked && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
            <span className="font-bold">Project locked.</span>{" "}
            {record.project_lock_reason}
          </div>
        )}
        {actionError && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </div>
        )}
        <div
          id="project-details"
          className="grid scroll-mt-24 gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Info label="Customer" value={record.customer} />
          <Info label="Project Name" value={record.project_name} />
          <Info
            label="Source Inquiry"
            value={record.source_inquiry || "Direct"}
          />
          <Info label="Status" value={<Status value={record.status} />} />
        </div>
        <FixedTimelineFields
          value={{
            start_date: record.start_date || "",
            timeline_weeks: record.timeline_weeks,
            expected_end_date:
              record.expected_end_date || record.target_end_date,
            actual_end_date: record.actual_end_date,
          }}
          readOnly
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              Departments
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(record.departments || []).map((department) => (
                <span
                  key={department}
                  className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
                >
                  {department}
                </span>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-slate-500">
                Panel
              </p>
              {recordPanels.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {recordPanels.map((panel, index) => {
                    const key = String(
                      panel.planning_key || panel.panel_no || index,
                    );
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setSearchParams({ panel: key })}
                        className={`rounded px-2 py-1 text-xs ${selectedPanelKey === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
                      >
                        {panel.panel_no} · {panel.panel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedPanel ? (
              <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {selectedPanel.panel_no} · {selectedPanel.panel} · Qty{" "}
                    {selectedPanel.qty || 1}
                  </span>
                  {selectedPanel.qty > 1 && (
                    <span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase text-indigo-700 ring-1 ring-indigo-100">
                      {selectedPanel.planning_mode}
                    </span>
                  )}
                </div>
                {selectedPanel.planning_mode === "separate" && (
                  <p className="mt-1 text-[11px] font-normal text-slate-500">
                    {(selectedPanel.planning_groups || [])
                      .map(
                        (group, groupIndex) =>
                          `Grid ${groupIndex + 1}: Qty ${group.qty}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No panel configured.</p>
            )}
          </section>
        </div>

        {version?.sections?.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-2 text-sm font-bold">Project Information</h3>
            <SectionDataView
              sections={version.sections}
              values={record.project_data || {}}
            />
          </section>
        )}

        <section
          id="project-planning"
          className="mt-4 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">Planning Grids</h3>
              <p className="text-xs text-slate-400">
                Only the selected panel's planning grids are shown when this
                project contains multiple panels.
              </p>
            </div>
            <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
              Overall{" "}
              {record.progress || planningProgress(record.planning_grid || [])}%
            </span>
          </div>
          {scopes.length ? (
            <div className="space-y-4">
              {scopes.map((scope, index) => (
                <div
                  id={`planning-grid-${index}`}
                  key={scope.key}
                  className={`scroll-mt-28 rounded-xl ${scope.key === effectiveScope ? "ring-2 ring-blue-100" : ""}`}
                >
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white">
                      Grid {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {scope.department} · {scope.panel}
                    </span>
                  </div>
                  <ProjectPlanningGrid
                    rows={scope.rows}
                    users={data.users || []}
                    statuses={statuses}
                    readOnly
                    compact
                    getRowAccess={getPlanningRowAccess}
                    onTaskChange={updatePlanningTask}
                    savingRowId={savingPlanningRowId}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ProjectPlanningGrid
              rows={[]}
              users={data.users || []}
              statuses={statuses}
              readOnly
              compact
              getRowAccess={getPlanningRowAccess}
              onTaskChange={updatePlanningTask}
              savingRowId={savingPlanningRowId}
            />
          )}
        </section>

        <ProjectMeetings
          projectId={id}
          projectNo={record.project_no}
          users={data.users || []}
          onChanged={refresh}
          readOnly
        />
        <div id="project-documents" className="scroll-mt-24">
          <RecordDocuments recordType="project" recordId={id} readOnly={!canEditDocuments} />
        </div>
        {copyConfirm && (
          <Modal
            title="Copy Project"
            onClose={() => !copying && setCopyConfirm(false)}
          >
            <p className="text-sm text-slate-600">
              Create a new project using this project's customer, departments,
              panels, planning structure and linked documents?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton
                type="button"
                onClick={() => setCopyConfirm(false)}
                disabled={copying}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={copyProject}
                disabled={copying}
              >
                {copying ? "Copying…" : "Copy Project"}
              </PrimaryButton>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] pb-4">
      <DetailHeader
        title={`Edit ${record.project_no}`}
        subtitle={`${record.project_name} · Master v${version?.version_no || "—"} · Grid v${planningMaster?.version_no || "—"}`}
        editing
        onBack={() => navigate("/projects")}
      />
      <ProjectToolbar
        record={record}
        scopes={scopes}
        selectedScope={effectiveScope}
        onScopeChange={jumpToScope}
        onRefresh={refresh}
        onActivity={() => navigate(`/projects/${id}/activity`)}
        onCopy={canCreate ? () => setCopyConfirm(true) : undefined}
        copying={copying}
      />
      {actionError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </div>
      )}
      <form onSubmit={save} className="space-y-3">
        <div id="project-details" className="scroll-mt-24">
          <SectionCard
            number="1"
            icon={FolderKanban}
            color="blue"
            title="Project Information"
            subtitle="Edit the project record and any additional fields configured in Project Master."
            className="!rounded-xl"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Source Inquiry">
                <Input value={record.source_inquiry || "Direct"} disabled />
              </Field>
              <Field label="Customer" required>
                <Select
                  value={form.customer_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer_id: event.target.value,
                    }))
                  }
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customer_name}
                    </option>
                  ))}
                </Select>
                {errors.customer_id && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.customer_id}
                  </p>
                )}
              </Field>
              <Field label="Project Name" required>
                <Input
                  value={form.project_name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      project_name: event.target.value,
                    }))
                  }
                />
                {errors.project_name && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.project_name}
                  </p>
                )}
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <FixedTimelineFields
              value={{
                start_date: form.start_date,
                timeline_weeks: form.timeline_weeks,
                expected_end_date: form.expected_end_date,
                actual_end_date: form.actual_end_date,
              }}
              onChange={(schedule) =>
                setForm((current) => ({ ...current, ...schedule }))
              }
              errors={errors}
            />
            {version?.sections?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <DynamicForm
                  embedded
                  sections={version.sections}
                  values={form.project_data}
                  onChange={(fieldId, value) =>
                    setForm((current) => ({
                      ...current,
                      project_data: {
                        ...current.project_data,
                        [fieldId]: value,
                      },
                    }))
                  }
                  errors={errors}
                />
              </div>
            )}
          </SectionCard>
        </div>

        <div id="project-planning" className="scroll-mt-24">
          <SectionCard
            number="2"
            icon={PanelsTopLeft}
            color="indigo"
            title="Panel & Department Planning"
            subtitle="For Qty > 1 choose Common or Separate. Separate Qty groups create independent planning grids."
            className="!rounded-xl"
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-600">
                      Project Panels
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isDirect
                        ? "Panel and Qty are editable for direct projects."
                        : "Panel and Qty inherited from Inquiry; planning mode remains configurable."}
                    </p>
                  </div>
                  {isDirect && (
                    <SecondaryButton
                      type="button"
                      onClick={() =>
                        applyDirectPanels([
                          ...directPanels,
                          newPanel(directPanels.length),
                        ])
                      }
                    >
                      <Plus size={13} /> Panel
                    </SecondaryButton>
                  )}
                </div>

                {isDirect ? (
                  <div className="space-y-3">
                    {directPanels.map((panel, index) => (
                      <div
                        key={panel._key || index}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)_90px_36px]">
                          <Input
                            value={panel.panel_no}
                            onChange={(event) =>
                              updateDirectPanel(index, {
                                panel_no: event.target.value,
                              })
                            }
                          />
                          <Select
                            value={panel.panel_id}
                            onChange={(event) =>
                              updateDirectPanel(index, {
                                panel_id: event.target.value,
                              })
                            }
                          >
                            <option value="">Select panel</option>
                            {panels.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.panel_code} · {item.panel_type}
                              </option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            min="1"
                            value={panel.qty}
                            onChange={(event) =>
                              updateDirectPanel(index, {
                                qty: event.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              applyDirectPanels(
                                directPanels.filter(
                                  (_, currentIndex) => currentIndex !== index,
                                ),
                              )
                            }
                            className="rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 size={14} className="mx-auto" />
                          </button>
                        </div>
                        {panel.panel_id && (
                          <ProjectQuantityPlanning
                            panel={panel}
                            onChange={(nextPanel) =>
                              replaceDirectPanelPlanning(index, nextPanel)
                            }
                            compact
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.panels.map((panel, index) => (
                      <div
                        key={panel.planning_key || index}
                        className="rounded-xl border border-blue-100 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {panel.panel_no} · {panel.panel}
                          </span>
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                            Qty {panel.qty || 1}
                          </span>
                        </div>
                        <ProjectQuantityPlanning
                          panel={panel}
                          onChange={(nextPanel) =>
                            updateInheritedPanelPlanning(index, nextPanel)
                          }
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )}

                {errors.panels && (
                  <p className="mt-2 text-xs text-rose-600">{errors.panels}</p>
                )}
                {errors.panel_planning && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">
                    {errors.panel_planning}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-600">
                  Departments
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {departments.map((department) => {
                    const selected = form.departments.includes(
                      department.department_name,
                    );
                    return (
                      <button
                        key={department.id}
                        type="button"
                        onClick={() =>
                          toggleDepartment(department.department_name)
                        }
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold ${selected ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {department.department_name}
                      </button>
                    );
                  })}
                </div>
                {errors.departments && (
                  <p className="mt-2 text-xs text-rose-600">
                    {errors.departments}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <ListChecks size={16} className="text-blue-600" /> Planning
                    Grids
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    All Common/Separate planning grids stay visible. The
                    selector above only jumps to the selected grid.
                  </p>
                </div>
                <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  Overall {planningProgress(form.planning_grid)}%
                </span>
              </div>
              {scopes.length ? (
                <div className="space-y-4">
                  {scopes.map((scope, index) => (
                    <div
                      id={`planning-grid-${index}`}
                      key={scope.key}
                      className={`scroll-mt-28 rounded-xl ${scope.key === effectiveScope ? "ring-2 ring-blue-100" : ""}`}
                    >
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white">
                          Grid {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {scope.department} · {scope.panel}
                        </span>
                      </div>
                      <ProjectPlanningGrid
                        rows={scope.rows}
                        onChange={mergeVisiblePlanningRows}
                        users={data.users || []}
                        statuses={statuses}
                        getRowAccess={getPlanningRowAccess}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <ProjectPlanningGrid
                  rows={[]}
                  onChange={mergeVisiblePlanningRows}
                  users={data.users || []}
                  statuses={statuses}
                  getRowAccess={getPlanningRowAccess}
                />
              )}
              {errors.planning_timeline && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">
                  {errors.planning_timeline}
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        <div id="project-documents" className="scroll-mt-24">
          <SectionCard
            number="3"
            icon={FileText}
            color="emerald"
            title="Project Documents"
            subtitle="Upload and manage project-specific documents using Document Type and Subtype."
            className="!rounded-xl"
          >
            <RecordDocuments recordType="project" recordId={id} embedded />
          </SectionCard>
        </div>

        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={() => navigate("/projects")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit">Save Changes</PrimaryButton>
        </div>
      </form>

      <ProjectMeetings
        projectId={id}
        projectNo={record.project_no}
        users={data.users || []}
        onChanged={refresh}
      />
      {copyConfirm && (
        <Modal
          title="Copy Project"
          onClose={() => !copying && setCopyConfirm(false)}
        >
          <p className="text-sm text-slate-600">
            Create a new project using this project's customer, departments,
            panels, planning structure and linked documents?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton
              type="button"
              onClick={() => setCopyConfirm(false)}
              disabled={copying}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={copyProject}
              disabled={copying}
            >
              {copying ? "Copying…" : "Copy Project"}
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

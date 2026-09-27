import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  FolderKanban,
  ListChecks,
  PanelsTopLeft,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Field,
  Input,
  matchesSearch,
  Modal,
  PageHeader,
  PrimaryButton,
  SearchBox,
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
import { RowActions } from "../components/RecordUI";
import ProjectQuantityPlanning, {
  expandPanelsForPlanning,
  normalizeProjectPanel,
  normalizeProjectPanels,
  setProjectPanelQty,
  validateProjectPanelPlanning,
} from "../components/ProjectQuantityPlanning";
import ProjectDraftDocuments, {
  uploadProjectDraftDocuments,
} from "../components/ProjectDraftDocuments";
import FixedTimelineFields, {
  addTimelineWeeks,
  timelineWeeksFromDates,
} from "../components/FixedTimelineFields";
import {
  collectDynamicDocumentDrafts,
  sanitizeDynamicDocumentValues,
  uploadDynamicDocumentDrafts,
} from "../utils/dynamicDocuments";

const PROJECT_STATUSES = ["Planning", "In Progress", "Hold", "Completed"];
const emptyDirectPanel = (index = 0) =>
  normalizeProjectPanel(
    {
      _key: `${Date.now()}-${index}-${Math.random()}`,
      panel_id: "",
      panel_no: `P-${String(index + 1).padStart(2, "0")}`,
      panel: "",
      qty: 1,
      planning_mode: "common",
      planning_groups: [],
    },
    index,
  );

const emptyForm = () => ({
  source_inquiry: "",
  customer_id: "",
  project_name: "",
  status: "Planning",
  start_date: "",
  timeline_weeks: "",
  expected_end_date: "",
  actual_end_date: "",
  departments: [],
  panels: [],
  project_data: {},
  planning_grid: [],
});

const ALL_FY = "all";
const currentFinancialYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const fyOptions = () => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    ALL_FY,
    ...Array.from({ length: 5 }, (_, i) => {
      const year = start - 2 + i;
      return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    }),
  ];
};
const inFinancialYear = (dateValue, fy) => {
  if (!fy || fy === ALL_FY) return true;
  const match = String(fy).match(/^(\d{4})-/);
  if (!match || !dateValue) return false;
  const startYear = Number(match[1]);
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date(startYear, 3, 1);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
  return date >= start && date <= end;
};
const projectEndDate = (project) => {
  // Project list must show the fixed Project Expected End Date only.
  // target_end_date is kept only as a legacy alias for older saved projects.
  if (project.expected_end_date)
    return String(project.expected_end_date).slice(0, 10);
  if (project.target_end_date)
    return String(project.target_end_date).slice(0, 10);
  return "";
};
const projectQuantity = (project) =>
  (project.panels || []).reduce(
    (sum, panel) => sum + Math.max(1, Number(panel.qty) || 1),
    0,
  ) || 1;
const panelPlanningRows = (project, panel, index = 0) => {
  const rows = project.planning_grid || [];
  const panelNo = String(panel.panel_no || "").trim();
  const panelName = String(panel.panel || panel.panel_type || "").trim();
  const planningKey = String(panel.planning_key || "").trim();
  const baseKey = String(panel.planning_base_key || "").trim();
  return rows.filter((task) => {
    const taskPanel = String(task.panel || "").trim();
    const taskPanelKey = String(task.panel_key || "").trim();
    const taskBaseKey = String(task.planning_base_key || "").trim();
    if (
      planningKey &&
      (taskPanelKey.includes(planningKey) || taskBaseKey.includes(planningKey))
    )
      return true;
    if (
      baseKey &&
      (taskPanelKey.includes(baseKey) || taskBaseKey.includes(baseKey))
    )
      return true;
    if (panelNo && taskPanel.includes(panelNo)) return true;
    const sameNameCount = (project.panels || []).filter(
      (item) =>
        String(item.panel || item.panel_type || "").trim() === panelName,
    ).length;
    if (panelName && sameNameCount === 1 && taskPanel.includes(panelName))
      return true;
    return false;
  });
};
const panelDepartments = (project, panel, index = 0) => {
  const names = [
    ...new Set(
      panelPlanningRows(project, panel, index)
        .map((task) => task.department)
        .filter(Boolean),
    ),
  ];
  return names.length ? names : project.departments || [];
};
const panelProgress = (project, panel, index = 0) => {
  const tasks = panelPlanningRows(project, panel, index);
  return tasks.length ? planningProgress(tasks) : project.progress || 0;
};
const panelEndDate = (project, panel, index = 0) => {
  // Expanded panel rows show the latest expected end date for that panel.
  // Never substitute Actual End Date in the Project list.
  const dates = panelPlanningRows(project, panel, index)
    .map((task) => task.expected_end_date || task.planned_end)
    .filter(Boolean)
    .map((value) => String(value).slice(0, 10))
    .sort();
  return dates.length ? dates[dates.length - 1] : projectEndDate(project);
};
const formatDate = (value) => {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export default function ProjectsPage({ createMode = false }) {
  const { data, refresh } = useStore();
  const navigate = useNavigate();
  const permissions = new Set(data.currentUser?.permissions || []);
  const canCreate = permissions.has('PROJECTS.CREATE');
  const canUpdate = permissions.has('PROJECTS.UPDATE');
  const [q, setQ] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [expandedProjects, setExpandedProjects] = useState(() => new Set());
  const [form, setForm] = useState(emptyForm);
  const [directPanels, setDirectPanels] = useState([emptyDirectPanel(0)]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const activeProjectMasterVersion = data.projectMaster?.versions?.find(
    (v) => v.is_active,
  );
  const projectMasterSections = activeProjectMasterVersion?.sections || [];
  const planningMaster = data.planningGridMaster || {
    statuses: [],
    department_tasks: {},
  };
  const planningStatuses = planningMaster.statuses?.length
    ? planningMaster.statuses
    : ["Pending", "In Progress", "Delay", "Completed", "On Hold"];
  const departments = (data.departments || []).filter(
    (department) => department.is_active !== false,
  );
  const activePanels = (data.panelMasters || []).filter(
    (panel) => panel.is_active !== false,
  );

  const creatorOptions = useMemo(
    () =>
      [
        ...new Set(
          (data.projects || []).map((row) => row.created_by).filter(Boolean),
        ),
      ].sort(),
    [data.projects],
  );
  const rows = useMemo(() => {
    return (data.projects || []).filter((row) => {
      const matchesQuery = matchesSearch(
        [
          row.project_no,
          row.source_inquiry,
          row.customer,
          row.project_name,
          row.created_by,
          row.status,
          ...(row.departments || []),
          ...(row.panels || []).map((panel) => panel.panel),
        ],
        q,
      );
      const matchesEnd =
        !endDateFilter || projectEndDate(row) === endDateFilter;
      const matchesCreator =
        !createdByFilter || row.created_by === createdByFilter;
      const matchesFy = inFinancialYear(row.created_at, financialYear);
      return matchesQuery && matchesEnd && matchesCreator && matchesFy;
    });
  }, [data.projects, q, endDateFilter, createdByFilter, financialYear]);
  const pageSizeOptions = [10, 25, 50, 100];
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 25;
  const totalPages = rows.length ? Math.ceil(rows.length / effectiveLimit) : 0;
  const safePage = totalPages ? Math.min(Math.max(1, page), totalPages) : 0;
  const pageStart = safePage ? (safePage - 1) * effectiveLimit : 0;
  const pagedRows = rows.slice(pageStart, pageStart + effectiveLimit);
  const toggleProjectPanels = (projectId) => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const syncGrid = (currentRows, nextDepartments, nextPanels) =>
    syncPlanningRows(
      currentRows,
      nextDepartments,
      expandPanelsForPlanning(nextPanels),
      planningMaster,
    );

  const panelRecordsFromInquiry = (inquiry) => {
    if (!inquiry) return [];
    if (inquiry.panel_instances?.length)
      return normalizeProjectPanels(
        inquiry.panel_instances.map((panel) => ({
          panel_id: panel.panel_master_id || panel.panel_id,
          panel_no: panel.panel_no,
          panel: panel.panel_type || panel.panel,
          qty: panel.qty || 1,
          planning_mode: panel.planning_mode || "common",
          planning_groups: panel.planning_groups || [],
        })),
      );
    return normalizeProjectPanels(
      (inquiry.panels || []).map((panel) => ({
        ...panel,
        qty: panel.qty || 1,
      })),
    );
  };

  const setSourceInquiry = (inquiryNo) => {
    const inquiry = data.inquiries?.find(
      (item) => item.inquiry_no === inquiryNo,
    );
    const panels = panelRecordsFromInquiry(inquiry);
    setForm((prev) => ({
      ...prev,
      source_inquiry: inquiryNo,
      customer_id: inquiry?.customer_id || (inquiryNo ? "" : prev.customer_id),
      project_name:
        inquiry?.project_name || (inquiryNo ? "" : prev.project_name),
      start_date: "",
      timeline_weeks: inquiry
        ? inquiry.timeline_weeks ||
          timelineWeeksFromDates(
            inquiry.start_date || inquiry.inquiry_date,
            inquiry.expected_end_date || inquiry.order_expected_end_date,
          ) ||
          ""
        : "",
      expected_end_date: "",
      actual_end_date: inquiry?.actual_end_date || "",
      panels,
      planning_grid: syncGrid(prev.planning_grid, prev.departments, panels),
    }));
    if (!inquiryNo) {
      setDirectPanels([emptyDirectPanel(0)]);
      setForm((prev) => ({
        ...prev,
        panels: [],
        planning_grid: syncGrid(prev.planning_grid, prev.departments, []),
      }));
    }
  };

  const toggleDepartment = (departmentName) => {
    setForm((prev) => {
      const nextDepartments = prev.departments.includes(departmentName)
        ? prev.departments.filter((name) => name !== departmentName)
        : [...prev.departments, departmentName];
      return {
        ...prev,
        departments: nextDepartments,
        planning_grid: syncGrid(
          prev.planning_grid,
          nextDepartments,
          prev.panels,
        ),
      };
    });
  };

  const updateDirectPanels = (nextEntries) => {
    const normalizedEntries = nextEntries.map((entry, index) =>
      normalizeProjectPanel(entry, index),
    );
    setDirectPanels(normalizedEntries);
    const panels = normalizedEntries
      .filter((entry) => entry.panel_id)
      .map((entry, index) => {
        const panel = activePanels.find((item) => item.id === entry.panel_id);
        return normalizeProjectPanel(
          {
            ...entry,
            panel_id: entry.panel_id,
            panel_no: entry.panel_no || "P-01",
            panel: panel?.panel_type || entry.panel,
          },
          index,
        );
      });
    setForm((prev) => ({
      ...prev,
      panels,
      planning_grid: syncGrid(prev.planning_grid, prev.departments, panels),
    }));
  };

  const updateDirectPanel = (idx, patch) => {
    const next = directPanels.map((entry, i) => {
      if (i !== idx) return entry;
      if (Object.prototype.hasOwnProperty.call(patch, "qty"))
        return setProjectPanelQty({ ...entry, ...patch }, patch.qty);
      return normalizeProjectPanel({ ...entry, ...patch }, idx);
    });
    updateDirectPanels(next);
  };

  const replaceDirectPanelPlanning = (idx, nextPanel) => {
    updateDirectPanels(
      directPanels.map((entry, i) =>
        i === idx ? normalizeProjectPanel(nextPanel, idx) : entry,
      ),
    );
  };

  const updateInheritedPanelPlanning = (idx, nextPanel) => {
    setForm((prev) => {
      const panels = prev.panels.map((panel, index) =>
        index === idx
          ? normalizeProjectPanel(nextPanel, index)
          : normalizeProjectPanel(panel, index),
      );
      return {
        ...prev,
        panels,
        planning_grid: syncGrid(prev.planning_grid, prev.departments, panels),
      };
    });
  };

  const addDirectPanel = () =>
    updateDirectPanels([
      ...directPanels,
      emptyDirectPanel(directPanels.length),
    ]);
  const removeDirectPanel = (idx) =>
    updateDirectPanels(directPanels.filter((_, i) => i !== idx));

  const resetForm = () => {
    setForm(emptyForm());
    setDirectPanels([emptyDirectPanel(0)]);
    setProjectDocuments([]);
    setFormErrors({});
    setSaveError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!form.customer_id) errors.customer_id = "Customer is required.";
    if (!form.project_name.trim())
      errors.project_name = "Project Name is required.";
    if (!form.start_date) errors.start_date = "Start Date is required.";
    if (
      !Number.isFinite(Number(form.timeline_weeks)) ||
      Number(form.timeline_weeks) <= 0
    )
      errors.timeline_weeks =
        "Enter a positive timeline, for example 0.5 or 2 weeks.";
    if (!form.departments.length)
      errors.departments = "Select at least one department.";
    if (!form.panels.length)
      errors.panels = "Select at least one project panel.";
    const planningError = validateProjectPanelPlanning(form.panels);
    if (planningError) errors.panel_planning = planningError;
    const timelineError = validatePlanningTimelines(form.planning_grid);
    if (timelineError) errors.planning_timeline = timelineError;
    const dynamicValidation = validateDynamicForm(
      projectMasterSections,
      form.project_data,
    );
    Object.assign(errors, dynamicValidation.errors);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    const dynamicDocumentDrafts = collectDynamicDocumentDrafts(
      projectMasterSections,
      form.project_data || {},
    );
    const customer = data.customers?.find(
      (item) => item.id === form.customer_id,
    );
    const progress = planningProgress(form.planning_grid);
    const payload = {
      project_no: `NAPL-${String((data.projects?.length || 0) + 1).padStart(4, "0")}`,
      source_inquiry: form.source_inquiry || "Direct",
      inquiry_id: form.source_inquiry
        ? data.inquiries?.find(
            (item) => item.inquiry_no === form.source_inquiry,
          )?.id
        : null,
      customer_id: form.customer_id,
      customer: customer?.customer_name || "",
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
      progress,
      created_at: new Date().toISOString().slice(0, 10),
      departments: form.departments,
      assignments: [
        ...new Set(
          form.planning_grid.map((row) => row.assigned_to).filter(Boolean),
        ),
      ],
      panels: normalizeProjectPanels(form.panels),
      planning_grid: form.planning_grid,
      project_master_version_id: activeProjectMasterVersion?.id || null,
      planning_grid_version_id: planningMaster?.id || null,
      project_data: sanitizeDynamicDocumentValues(form.project_data || {}),
    };

    setSaving(true);
    setSaveError("");
    let createdId = "";
    try {
      const created = await api("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      createdId = created?.id || "";
      if (!createdId)
        throw new Error(
          "Project was created but the backend did not return its ID.",
        );
      if (dynamicDocumentDrafts.length)
        await uploadDynamicDocumentDrafts(
          api,
          "project",
          createdId,
          dynamicDocumentDrafts,
        );
      await uploadProjectDraftDocuments(api, createdId, projectDocuments);
      await refresh();
      resetForm();
      navigate("/projects");
    } catch (error) {
      setSaveError(
        createdId
          ? `Project created, but one or more documents could not be uploaded: ${error.message}. Open the project and upload the remaining document there.`
          : error.message || "Unable to create project.",
      );
      if (createdId) {
        await refresh().catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  };

  if (createMode) {
    return (
      <div className="fade-in mx-auto max-w-[1600px] pb-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div className="mt-1">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                New Project
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                Project information, quantity-based planning grids and documents
                are managed in one workflow.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 ring-1 ring-blue-200">
              Quantity-aware Planning
            </span>
            {activeProjectMasterVersion && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Project Master v{activeProjectMasterVersion.version_no}
              </span>
            )}
          </div>
        </div>

        {!activeProjectMasterVersion && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertCircle size={16} /> No active Project Master. Core project and
            planning fields still work; configure additional fields in Project
            Master.
          </div>
        )}
        {saveError && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {saveError}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <SectionCard
            number="1"
            icon={FolderKanban}
            color="blue"
            title="Project Information"
            subtitle="Core project fields plus any additional fields configured in Project Master."
            className="!rounded-xl"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Source Inquiry">
                <Select
                  value={form.source_inquiry}
                  onChange={(e) => setSourceInquiry(e.target.value)}
                >
                  <option value="">Direct Project</option>
                  {(data.inquiries || []).map((inquiry) => (
                    <option key={inquiry.id} value={inquiry.inquiry_no}>
                      {inquiry.inquiry_no} · {inquiry.project_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Customer" required>
                <Select
                  value={form.customer_id}
                  disabled={Boolean(form.source_inquiry)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customer_id: e.target.value,
                    }))
                  }
                  className={formErrors.customer_id ? "!border-rose-400" : ""}
                >
                  <option value="">Select customer</option>
                  {(data.customers || [])
                    .filter((customer) => customer.is_active !== false)
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customer_name}
                      </option>
                    ))}
                </Select>
                {formErrors.customer_id && (
                  <p className="mt-1 text-xs text-rose-600">
                    {formErrors.customer_id}
                  </p>
                )}
              </Field>
              <Field label="Project Name" required>
                <Input
                  value={form.project_name}
                  disabled={Boolean(form.source_inquiry)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      project_name: e.target.value,
                    }))
                  }
                  placeholder="Enter project name"
                  className={formErrors.project_name ? "!border-rose-400" : ""}
                />
                {formErrors.project_name && (
                  <p className="mt-1 text-xs text-rose-600">
                    {formErrors.project_name}
                  </p>
                )}
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value }))
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
                setForm((prev) => ({ ...prev, ...schedule }))
              }
              readOnly={Boolean(form.source_inquiry)}
              errors={formErrors}
            />
            {projectMasterSections.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <DynamicForm
                  embedded
                  sections={projectMasterSections}
                  values={form.project_data}
                  onChange={(fieldId, value) =>
                    setForm((prev) => ({
                      ...prev,
                      project_data: { ...prev.project_data, [fieldId]: value },
                    }))
                  }
                  errors={formErrors}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            number="2"
            icon={PanelsTopLeft}
            color="indigo"
            title="Panel & Department Planning"
            subtitle="Qty > 1 can use one Common grid or multiple Separate planning grids."
            className="!rounded-xl"
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                      Project Panels
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {form.source_inquiry
                        ? "Panel and Qty inherited from Inquiry; planning mode is selected here."
                        : "Select panel and Qty from Panel Master."}
                    </p>
                  </div>
                  {!form.source_inquiry && (
                    <SecondaryButton
                      type="button"
                      onClick={addDirectPanel}
                      className="!px-2 !py-1.5 !text-xs"
                    >
                      <Plus size={13} /> Panel
                    </SecondaryButton>
                  )}
                </div>

                {form.source_inquiry ? (
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
                ) : (
                  <div className="space-y-3">
                    {directPanels.map((entry, idx) => (
                      <div
                        key={entry._key}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)_90px_36px]">
                          <Input
                            value={entry.panel_no}
                            onChange={(e) =>
                              updateDirectPanel(idx, {
                                panel_no: e.target.value,
                              })
                            }
                            className="!h-9 !py-1.5 !text-xs"
                          />
                          <Select
                            value={entry.panel_id}
                            onChange={(e) =>
                              updateDirectPanel(idx, {
                                panel_id: e.target.value,
                              })
                            }
                            className="!h-9 !py-1.5 !text-xs"
                          >
                            <option value="">Select panel</option>
                            {activePanels.map((panel) => (
                              <option key={panel.id} value={panel.id}>
                                {panel.panel_code} · {panel.panel_type}
                              </option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            min="1"
                            value={entry.qty}
                            onChange={(e) =>
                              updateDirectPanel(idx, { qty: e.target.value })
                            }
                            className="!h-9 !py-1.5 !text-xs"
                            title="Panel Qty"
                          />
                          <button
                            type="button"
                            disabled={directPanels.length === 1}
                            onClick={() => removeDirectPanel(idx)}
                            className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {entry.panel_id && (
                          <ProjectQuantityPlanning
                            panel={entry}
                            onChange={(nextPanel) =>
                              replaceDirectPanelPlanning(idx, nextPanel)
                            }
                            compact
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {formErrors.panels && (
                  <p className="mt-2 text-xs font-semibold text-rose-600">
                    {formErrors.panels}
                  </p>
                )}
                {formErrors.panel_planning && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">
                    {formErrors.panel_planning}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Departments
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    From Department Master; each selection loads its master
                    tasks for every active planning grid.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {departments.map((department) => {
                    const selected = form.departments.includes(
                      department.department_name,
                    );
                    const count =
                      planningMaster.department_tasks?.[
                        department.department_name
                      ]?.length || 0;
                    return (
                      <button
                        type="button"
                        key={department.id}
                        onClick={() =>
                          toggleDepartment(department.department_name)
                        }
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition ${selected ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">
                            {department.department_name}
                          </span>
                          <span className="text-[10px] opacity-60">
                            {count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {formErrors.departments && (
                  <p className="mt-2 text-xs font-semibold text-rose-600">
                    {formErrors.departments}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <ListChecks size={16} className="text-blue-600" /> Planning
                    Grid
                  </h3>
                  <p className="text-xs text-slate-400">
                    Common mode creates one grid for the full Qty. Separate mode
                    creates one grid per configured Qty group.
                  </p>
                </div>
                <div className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  Overall {planningProgress(form.planning_grid)}%
                </div>
              </div>
              <ProjectPlanningGrid
                rows={form.planning_grid}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, planning_grid: next }))
                }
                users={data.users || []}
                statuses={planningStatuses}
              />
              {formErrors.planning_timeline && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">
                  {formErrors.planning_timeline}
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            number="3"
            icon={FileText}
            color="emerald"
            title="Project Documents"
            subtitle="Upload project-specific documents and classify them using Document Title and Subtype."
            className="!rounded-xl"
          >
            <ProjectDraftDocuments
              documentTypes={data.documentTypes || []}
              value={projectDocuments}
              onChange={setProjectDocuments}
            />
          </SectionCard>

          <div className="sticky bottom-0 z-20 -mx-3 flex justify-end gap-2 border-t border-slate-200 bg-slate-100/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5 xl:-mx-6 xl:px-6">
            <SecondaryButton
              type="button"
              onClick={() => navigate("/projects")}
              className="!py-2"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving} className="!py-2">
              <ClipboardCheck size={15} />{" "}
              {saving ? "Creating…" : "Create Project"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Projects"
        description="Manage projects, planning, progress and documents."
        action={canCreate ? (
          <PrimaryButton onClick={() => navigate("/projects/new")}>
            <Plus size={16} /> New Project
          </PrimaryButton>
        ) : null}
      />

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1.4fr)_160px_190px_120px_40px]">
          <SearchBox
            value={q}
            onChange={(value) => {
              setQ(value);
              setPage(1);
            }}
            placeholder="Search Project ID, INQ No, customer, project…"
          />
          <Input
            type="date"
            value={endDateFilter}
            onChange={(e) => {
              setEndDateFilter(e.target.value);
              setPage(1);
            }}
            title="Expected End Date"
          />
          <Select
            value={createdByFilter}
            onChange={(e) => {
              setCreatedByFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Created By</option>
            {creatorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            value={financialYear}
            onChange={(e) => {
              setFinancialYear(e.target.value);
              setPage(1);
            }}
          >
            {fyOptions().map((fy) => (
              <option key={fy} value={fy}>
                {fy === ALL_FY ? "All Years" : fy}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setEndDateFilter("");
              setCreatedByFilter("");
              setFinancialYear(currentFinancialYear());
              setPage(1);
            }}
            className="flex h-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-blue-600"
            title="Refresh / clear filters"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {[
                  "Sr. No.",
                  "Project ID",
                  "INQ No",
                  "Customer",
                  "Project Name",
                  "Quantity",
                  "Created By",
                  "Panels",
                  "Status",
                  "Progress",
                  "Expected End Date",
                  "Actions",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan="12"
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    No records found
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, rowIndex) => {
                  const panelRows = normalizeProjectPanels(row.panels || []);
                  const panelNames = [
                    ...new Set(
                      panelRows.map((panel) => panel.panel).filter(Boolean),
                    ),
                  ];
                  const isExpanded =
                    panelRows.length > 1 && expandedProjects.has(row.id);
                  const mainRow = (
                    <tr
                      key={row.id}
                      onClick={(event) => {
                        if (
                          event.target.closest(
                            "button,a,input,select,textarea,label",
                          )
                        )
                          return;
                        navigate(`/projects/${row.id}/view`);
                      }}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50/70 ${row.project_locked ? "border-l-4 border-l-amber-400 bg-amber-50/60 text-slate-800 backdrop-blur-[0.5px]" : ""}`}
                    >
                      <td className="px-3 py-2.5 text-slate-600">
                        {pageStart + rowIndex + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {panelRows.length > 1 ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProjectPanels(row.id);
                              }}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                              title={
                                isExpanded
                                  ? "Hide project panels"
                                  : `Show ${panelRows.length} project panels`
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              )}
                            </button>
                          ) : (
                            <span className="h-6 w-6 shrink-0" />
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${row.id}/view`)}
                            className="font-mono text-xs font-bold text-blue-700 hover:underline"
                          >
                            {row.project_no}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={!row.inquiry_id}
                          onClick={() =>
                            row.inquiry_id &&
                            navigate(`/inquiries/${row.inquiry_id}/view`)
                          }
                          className={`font-mono text-xs font-semibold ${row.inquiry_id ? "text-emerald-700 hover:underline" : "text-slate-400"}`}
                        >
                          {row.source_inquiry || "Direct"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">
                        {row.customer || "—"}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${row.id}/view`)}
                          className={`text-left font-medium hover:underline ${row.project_locked ? "text-slate-800 hover:text-slate-900" : "text-slate-700 hover:text-blue-700"}`}
                        >
                          {row.project_name || "—"}
                        </button>
                        {row.source_inquiry_amendment && (
                          <p
                            className="mt-1 line-clamp-1 text-[10px] font-semibold text-amber-700"
                            title={row.source_inquiry_amendment_message}
                          >
                            Amendment · {row.source_inquiry_status}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700">
                        {projectQuantity(row)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {row.created_by || "—"}
                          {row.created_by_id === data.currentUser?.id && (
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              (You)
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="max-w-[240px] text-xs font-semibold text-indigo-700">
                          {panelNames.join(", ") || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Status value={row.status} />
                        {row.project_locked && (
                          <p className="mt-1 text-[10px] font-bold uppercase text-amber-700">
                            Locked · {row.source_inquiry_status}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-[105px] items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${row.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-500">
                            {row.progress || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {formatDate(projectEndDate(row))}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${row.id}/view`)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                            title="View"
                          >
                            <Eye size={15} />
                          </button>
                          {canUpdate && row.can_edit !== false && <button
                            type="button"
                            disabled={row.project_locked}
                            onClick={() =>
                              !row.project_locked &&
                              navigate(`/projects/${row.id}/edit`)
                            }
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-30"
                            title={
                              row.project_locked
                                ? row.project_lock_reason
                                : "Edit"
                            }
                          >
                            <Pencil size={15} />
                          </button>}
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/projects/${row.id}/activity`)
                            }
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                            title="Activity Graph"
                          >
                            <Activity size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );

                  const panelDetailRows = isExpanded
                    ? panelRows.map((panel, panelIndex) => {
                        const panelKey = String(
                          panel.planning_key || panel.panel_no || panelIndex,
                        );
                        const progressForPanel = panelProgress(
                          row,
                          panel,
                          panelIndex,
                        );
                        const endDateForPanel = panelEndDate(
                          row,
                          panel,
                          panelIndex,
                        );
                        return (
                          <tr
                            key={`${row.id}-panel-${panelKey}`}
                            onClick={(event) => {
                              if (
                                event.target.closest(
                                  "button,a,input,select,textarea,label",
                                )
                              )
                                return;
                              navigate(
                                `/projects/${row.id}/view?panel=${encodeURIComponent(panelKey)}`,
                              );
                            }}
                            className={`cursor-pointer border-b border-slate-100 bg-indigo-50/25 hover:bg-indigo-50/60 ${row.project_locked ? "border-l-4 border-l-amber-400 bg-amber-50/60 text-slate-800 backdrop-blur-[0.5px]" : ""}`}
                          >
                            <td className="px-3 py-2.5 text-xs text-slate-500">
                              {pageStart + rowIndex + 1}.{panelIndex + 1}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="pl-7">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/projects/${row.id}/view?panel=${encodeURIComponent(panelKey)}`,
                                    )
                                  }
                                  className="font-mono text-xs font-bold text-blue-700 hover:underline"
                                >{`${String(row.project_no || "NAPL").replace(/-/g, "_")}_${panelIndex + 1}`}</button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                disabled={!row.inquiry_id}
                                onClick={() =>
                                  row.inquiry_id &&
                                  navigate(`/inquiries/${row.inquiry_id}/view`)
                                }
                                className={`font-mono text-xs font-semibold ${row.inquiry_id ? "text-emerald-700 hover:underline" : "text-slate-400"}`}
                              >
                                {row.source_inquiry || "Direct"}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800">
                              {row.customer || "—"}
                            </td>
                            <td className="max-w-[260px] px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/projects/${row.id}/view?panel=${encodeURIComponent(panelKey)}`,
                                  )
                                }
                                className={`text-left font-medium hover:underline ${row.project_locked ? "text-slate-800" : "text-slate-700 hover:text-blue-700"}`}
                              >
                                {row.project_name || "—"}
                              </button>
                              {row.source_inquiry_amendment && (
                                <p
                                  className="mt-1 line-clamp-1 text-[10px] font-semibold text-amber-700"
                                  title={row.source_inquiry_amendment_message}
                                >
                                  Amendment · {row.source_inquiry_status}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-700">
                              {Math.max(1, Number(panel.qty) || 1)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">
                              <span className="inline-flex items-center gap-1.5">
                                {row.created_by || "—"}
                                {row.created_by_id === data.currentUser?.id && (
                                  <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                    (You)
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="max-w-[240px] text-[11px] font-bold text-indigo-700">
                                {panel.panel || "Panel"} · Qty {panel.qty || 1}
                              </p>
                            </td>
                            <td className="px-3 py-2.5">
                              <Status value={row.status} />
                              {row.project_locked && (
                                <p className="mt-1 text-[10px] font-bold uppercase text-amber-700">
                                  Locked · {row.source_inquiry_status}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex min-w-[105px] items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-blue-600"
                                    style={{ width: `${progressForPanel}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-slate-500">
                                  {progressForPanel}%
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                              {formatDate(endDateForPanel)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/projects/${row.id}/view?panel=${encodeURIComponent(panelKey)}`,
                                    )
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                                  title={`View ${panel.panel_no || "panel"}`}
                                >
                                  <Eye size={15} />
                                </button>
                                {canUpdate && row.can_edit !== false && <button
                                  type="button"
                                  disabled={row.project_locked}
                                  onClick={() =>
                                    !row.project_locked &&
                                    navigate(
                                      `/projects/${row.id}/edit?panel=${encodeURIComponent(panelKey)}`,
                                    )
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-30"
                                  title={
                                    row.project_locked
                                      ? row.project_lock_reason
                                      : "Edit project"
                                  }
                                >
                                  <Pencil size={15} />
                                </button>}
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/projects/${row.id}/activity`)
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                                  title="Activity Graph"
                                >
                                  <Activity size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    : [];

                  return (
                    <React.Fragment key={row.id}>
                      {mainRow}
                      {panelDetailRows}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Show per page:</span>
            <Select
              data-draft-ignore="true"
              value={effectiveLimit}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (pageSizeOptions.includes(next)) {
                  setLimit(next);
                  setPage(1);
                }
              }}
              className="!w-[76px] !py-1.5"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={!totalPages || safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

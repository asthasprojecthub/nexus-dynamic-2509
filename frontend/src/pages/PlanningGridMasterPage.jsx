import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  CopyPlus,
  Eye,
  Pencil,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import {
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Status,
  Table,
} from "../components/ui";

const BASE = ["Pending", "In Progress", "Delay", "Completed", "On Hold"];
const clone = (v) => JSON.parse(JSON.stringify(v));
const newId = () => `pgt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function PlanningSaveDialog({ open, name, saving, onCancel, onSaveOnly, onSaveAndActivate }) {
  if (!open) return null;
  return (
    <Modal title="Save Planning Grid Version" onClose={() => !saving && onCancel()}>
      <p className="text-sm leading-6 text-slate-600">Do you want to activate “{name}” after saving it?</p>
      <p className="mt-2 text-xs text-slate-400">Save Only keeps the current active Planning Grid unchanged.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <SecondaryButton type="button" disabled={saving} onClick={onCancel}>Cancel</SecondaryButton>
        <button type="button" disabled={saving} onClick={onSaveOnly} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Save Only</button>
        <PrimaryButton type="button" disabled={saving} onClick={onSaveAndActivate}>{saving ? "Saving..." : "Save & Activate"}</PrimaryButton>
      </div>
    </Modal>
  );
}

export default function PlanningGridMasterPage({ mode = "list" }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, savePlanningGridVersion, updatePlanningGridVersion } =
    useStore();
  const departments = useMemo(
    () =>
      (data.departments || [])
        .filter((d) => d.is_active !== false)
        .map((d) => d.department_name),
    [data.departments],
  );
  const versions = (data.planningGridVersions || [])
    .slice()
    .sort((a, b) => (b.version_no || 0) - (a.version_no || 0));
  const active = data.planningGridMaster || {
    form_name: "Project Planning Grid",
    statuses: BASE,
    department_tasks: {},
  };
  const firstVersion =
    versions.find((version) => Number(version.version_no) === 1) ||
    versions[versions.length - 1];
  const current = id ? versions.find((v) => v.id === id) : active;
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);
  const toggleVersion = (version) => {
    if (!version.is_active) {
      setPendingActivate(version);
      return;
    }
    const fallback = versions
      .filter((item) => item.id !== version.id)
      .slice()
      .sort((a, b) => (a.version_no || 0) - (b.version_no || 0))[0];
    if (!fallback) return;
    setPendingDeactivate({ version, fallback });
  };

  if (mode === "list") {
    return (
      <div className="fade-in">
        <PageHeader
          title="Planning Grid Master"
          description="Version-controlled planning grid templates. Projects use the active version when planning grids are created."
          action={
            <PrimaryButton
              onClick={() => navigate("/masters/planning-grid/new")}
            >
              <CopyPlus size={15} /> Add Planning Grid
            </PrimaryButton>
          }
        />
        <Table
          rows={versions}
          empty="No Planning Grid version created yet."
          onRowClick={(version) =>
            navigate(`/masters/planning-grid/${version.id}/view`)
          }
          columns={[
            {
              key: "version_no",
              label: "Version",
              render: (value) => (
                <span className="font-semibold">Version {value}</span>
              ),
            },
            { key: "form_name", label: "Form Name" },
            {
              key: "departments",
              label: "Departments",
              render: (_, version) =>
                Object.keys(version.department_tasks || {}).length,
            },
            {
              key: "tasks",
              label: "Tasks",
              render: (_, version) =>
                Object.values(version.department_tasks || {}).reduce(
                  (count, rows) => count + (rows?.length || 0),
                  0,
                ),
            },
            {
              key: "statuses",
              label: "Statuses",
              render: (value) => (value || []).length,
            },
            {
              key: "is_active",
              label: "State",
              render: (value) => (
                <Status value={value ? "Active" : "Inactive"} />
              ),
            },
            {
              key: "id",
              label: "Actions",
              render: (_, version) => (
                <div className="flex justify-end gap-1">
                  <button
                    className="rounded-md p-2 hover:bg-slate-100"
                    onClick={() =>
                      navigate(`/masters/planning-grid/${version.id}/view`)
                    }
                    title="View"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="rounded-md p-2 hover:bg-slate-100"
                    onClick={() =>
                      navigate(`/masters/planning-grid/${version.id}/edit`)
                    }
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className={`rounded-md p-2 disabled:cursor-not-allowed disabled:opacity-40 ${version.is_active ? "text-emerald-600 hover:bg-rose-50 hover:text-rose-600" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"}`}
                    disabled={version.is_active && versions.length === 1}
                    onClick={() => toggleVersion(version)}
                    title={
                      version.is_active
                        ? versions.length === 1
                          ? "Create another version before deactivating"
                          : "Deactivate and activate Version 1"
                        : "Set Active"
                    }
                  >
                    {version.is_active ? (
                      <ToggleRight size={16} />
                    ) : (
                      <ToggleLeft size={16} />
                    )}
                  </button>
                </div>
              ),
            },
          ]}
        />
        <ConfirmDialog
          open={!!pendingActivate}
          title="Activate Planning Grid version?"
          message={
            pendingActivate
              ? `Are you sure you want to activate ${pendingActivate.form_name} · Version ${pendingActivate.version_no}?`
              : ""
          }
          confirmLabel="Activate"
          onCancel={() => setPendingActivate(null)}
          onConfirm={() => {
            const pending = pendingActivate;
            setPendingActivate(null);
            if (pending)
              updatePlanningGridVersion(pending.id, { is_active: true });
          }}
        />
        <ConfirmDialog
          open={!!pendingDeactivate}
          title="Deactivate Planning Grid version?"
          message={
            pendingDeactivate
              ? `Are you sure you want to deactivate Version ${pendingDeactivate.version.version_no} – ${pendingDeactivate.version.form_name}?\n\nVersion ${pendingDeactivate.fallback.version_no} – ${pendingDeactivate.fallback.form_name} will be activated.`
              : ""
          }
          confirmLabel="Deactivate"
          danger
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => {
            const pending = pendingDeactivate;
            setPendingDeactivate(null);
            if (pending)
              updatePlanningGridVersion(pending.version.id, {
                is_active: false,
              });
          }}
        />
      </div>
    );
  }

  if (mode === "new")
    return (
      <Editor
        initial={{
          id: null,
          version_no: null,
          is_active: false,
          form_name: firstVersion?.form_name || active.form_name || "Project Planning Grid",
          statuses: BASE,
          department_tasks: {},
        }}
        copySource={clone(firstVersion || active)}
        departments={departments}
        title="Add Planning Grid"
        isNew
        onCancel={() => navigate("/masters/planning-grid")}
        onSave={async (draft, activate) => {
          await savePlanningGridVersion({...draft,is_active:activate});
          navigate("/masters/planning-grid");
        }}
      />
    );
  if (!current)
    return (
      <div className="p-8 text-center text-slate-500">
        Planning Grid version not found.
      </div>
    );
  if (mode === "view")
    return (
      <Viewer
        version={current}
        departments={departments}
        onBack={() => navigate("/masters/planning-grid")}
        onEdit={() => navigate(`/masters/planning-grid/${current.id}/edit`)}
      />
    );
  return (
    <Editor
      initial={clone(current)}
      departments={departments}
      title={`Edit Planning Grid · Version ${current.version_no}`}
      onCancel={() => navigate("/masters/planning-grid")}
      onSave={async (draft, activate) => {
        const payload={...draft,...(activate?{is_active:true}:{})};
        if (current.id) await updatePlanningGridVersion(current.id, payload);
        else await savePlanningGridVersion({...payload,is_active:activate});
        navigate("/masters/planning-grid");
      }}
    />
  );
}

function Viewer({ version, departments, onBack, onEdit }) {
  const [selected, setSelected] = useState(departments[0] || "");
  const tasks = version.department_tasks?.[selected] || [];
  return (
    <div className="fade-in mx-auto max-w-[1500px]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70"
          >
            <ArrowLeft size={16}/> Back
          </button>
          <h1 className="text-xl font-bold">{version.form_name}</h1>
          <p className="text-sm text-slate-500">
            Version {version.version_no}
            {version.is_active ? " · Active" : ""}
          </p>
        </div>
        <PrimaryButton onClick={onEdit}>
          <Pencil size={14} /> Edit
        </PrimaryButton>
      </div>
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-white p-2">
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${selected === d ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}
            >
              {d}{" "}
              <span className="float-right text-xs">
                {version.department_tasks?.[d]?.length || 0}
              </span>
            </button>
          ))}
        </aside>
        <div>
          <table className="w-full rounded-xl border bg-white text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="w-16 px-3 py-2">Sr.</th>
                <th className="px-3 py-2 text-left">Task Name</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={t.id || `${t.name}-${i}`} className="border-t">
                  <td className="px-3 py-2 text-center">{i + 1}</td>
                  <td className="px-3 py-2">
                    {typeof t === "string" ? t : t.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 rounded-xl border bg-white p-4">
            <h3 className="mb-2 text-sm font-bold">Statuses</h3>
            <div className="flex flex-wrap gap-2">
              {(version.statuses || []).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Editor({
  initial,
  departments,
  title,
  onCancel,
  onSave,
  isNew = false,
  copySource = null,
}) {
  const [draft, setDraft] = useState(() => ({
    ...initial,
    form_name: initial.form_name || "Project Planning Grid",
    statuses: initial.statuses?.length ? initial.statuses : BASE,
    department_tasks: initial.department_tasks || {},
  }));
  const [versionStart, setVersionStart] = useState("scratch");
  const [selected, setSelected] = useState(departments[0] || "");
  const [newTask, setNewTask] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [error, setError] = useState("");
  const tasks = draft.department_tasks?.[selected] || [];
  const setTasks = (rows) =>
    setDraft((v) => ({
      ...v,
      department_tasks: { ...(v.department_tasks || {}), [selected]: rows },
    }));
  const addTask = () => {
    const clean = newTask.trim();
    if (!clean) return;
    setTasks([...tasks, { id: newId(), name: clean }]);
    setNewTask("");
  };
  const save = () => {
    if (!String(draft.form_name || '').trim()) {
      setError("Form Name is required.");
      return;
    }
    setPendingSave(true);
  };
  const performSave = async (activate) => {
    setPendingSave(false);
    setSaving(true);
    setError("");
    try {
      await onSave({
        form_name: draft.form_name,
        statuses: draft.statuses,
        department_tasks: draft.department_tasks,
      },activate);
    } catch (e) {
      setError(e.message || "Unable to save Planning Grid version.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fade-in mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={onCancel}
            className="mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70"
          >
            <ArrowLeft size={16}/> Back
          </button>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500">
            Save the Planning Grid as a version, then choose whether it should become active.
          </p>
        </div>
        {isNew && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setVersionStart("first");
                setDraft({
                  ...clone(copySource || initial),
                  form_name: copySource?.form_name || initial.form_name || "Project Planning Grid",
                  statuses: copySource?.statuses?.length ? copySource.statuses : BASE,
                  department_tasks: copySource?.department_tasks || {},
                });
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${versionStart === "first" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Copy Version 1 Fields
            </button>
            <button
              type="button"
              onClick={() => {
                setVersionStart("scratch");
                setDraft((v) => ({
                  ...v,
                  statuses: BASE,
                  department_tasks: {},
                }));
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${versionStart === "scratch" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Blank Version
            </button>
          </div>
        )}
      </div>
      <section className="mb-4 rounded-xl border bg-white p-4">
        <div className="max-w-xs">
          <Field label="Form Name" required>
            <Input
              value={draft.form_name}
              onChange={(e) =>
                setDraft((v) => ({ ...v, form_name: e.target.value }))
              }
            />
          </Field>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-white p-2">
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${selected === d ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}
            >
              {d}
              <span className="float-right text-xs">
                {draft.department_tasks?.[d]?.length || 0}
              </span>
            </button>
          ))}
        </aside>
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="flex gap-2 border-b p-3">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTask();
                  }
                }}
                placeholder={`Add ${selected} task`}
              />
              <PrimaryButton onClick={addTask}>
                <Plus size={14} /> Add Task
              </PrimaryButton>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="w-16 px-3 py-2">Sr.</th>
                  <th className="px-3 py-2 text-left">Task Name</th>
                  <th className="w-20 px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id || i} className="border-t">
                    <td className="px-3 py-2 text-center">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={typeof t === "string" ? t : t.name}
                        onChange={(e) =>
                          setTasks(
                            tasks.map((x, n) =>
                              n === i
                                ? {
                                    ...(typeof x === "string"
                                      ? { id: newId() }
                                      : x),
                                    name: e.target.value,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          setTasks(tasks.filter((_, n) => n !== i))
                        }
                        className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-xl border bg-white p-4">
            <h3 className="mb-2 text-sm font-bold">Task Statuses</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {draft.statuses.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold"
                >
                  {s}
                  {!BASE.includes(s) && (
                    <button
                      onClick={() =>
                        setDraft((v) => ({
                          ...v,
                          statuses: v.statuses.filter((x) => x !== s),
                        }))
                      }
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex max-w-lg gap-2">
              <Input
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                placeholder="Add status"
              />
              <SecondaryButton
                onClick={() => {
                  const c = newStatus.trim();
                  if (
                    c &&
                    !draft.statuses.some(
                      (s) => s.toLowerCase() === c.toLowerCase(),
                    )
                  )
                    setDraft((v) => ({ ...v, statuses: [...v.statuses, c] }));
                  setNewStatus("");
                }}
              >
                <Plus size={14} /> Add Status
              </SecondaryButton>
            </div>
          </section>
        </div>
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving…" : "Save Planning Grid"}
        </PrimaryButton>
      </div>
      <PlanningSaveDialog open={pendingSave} name={draft.form_name || "Planning Grid"} saving={saving} onCancel={()=>setPendingSave(false)} onSaveOnly={()=>performSave(false)} onSaveAndActivate={()=>performSave(true)}/>
    </div>
  );
}

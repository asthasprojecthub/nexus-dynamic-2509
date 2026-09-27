import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";

const StoreContext = createContext(null);
const emptyData = () => ({
  customers: [],
  departments: [],
  users: [],
  inquiryMaster: { id: null, versions: [] },
  projectMaster: { id: null, versions: [] },
  ticketMaster: { id: null, versions: [] },
  planningGridMaster: {
    id: "db-planning-grid",
    form_name: "Project Planning Grid",
    statuses: [],
    department_tasks: {},
  },
  planningGridVersions: [],
  panelMasters: [],
  panels: [],
  inquiries: [],
  projects: [],
  tickets: [],
  ticketWorkflows: [],
  ticketMasterOptions: [],
  documentTypes: [],
  documents: [],
  inquiryDocuments: [],
  projectDocuments: [],
  auditLogs: [],
  notifications: [],
  inquiryStatuses: [],
  currentUser: null,
});
const newId = () =>
  crypto.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const StoreProvider = ({ children }) => {
  const [data, setData] = useState(emptyData);
  const [backendStatus, setBackendStatus] = useState({
    connected: false,
    loading: true,
    error: "",
  });

  const refresh = useCallback(async () => {
    try {
      const next = await api("/bootstrap");
      setData((current) => ({ ...current, ...next }));
      setBackendStatus({ connected: true, loading: false, error: "" });
    } catch (error) {
      setBackendStatus({
        connected: false,
        loading: false,
        error: error.message,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = (promise) =>
    promise.then(refresh).catch((error) => {
      console.error(error);
      setBackendStatus((s) => ({ ...s, error: error.message }));
    });

  // Used by form-master save screens. Unlike run(), this rejects on API failure
  // so the page does not navigate away and pretend the master was saved.
  const runStrict = async (promise) => {
    try {
      const result = await promise;
      await refresh();
      setBackendStatus((s) => ({ ...s, error: "" }));
      return result;
    } catch (error) {
      console.error(error);
      setBackendStatus((s) => ({ ...s, error: error.message }));
      throw error;
    }
  };

  const add = (key, record) => {
    setData((current) => ({
      ...current,
      [key]: [{ ...record, id: newId() }, ...(current[key] || [])],
    }));
    const routes = {
      customers: "/customers",
      departments: "/departments",
      users: "/users",
      inquiries: "/inquiries",
      projects: "/projects",
      documentTypes: "/document-types",
    };
    if (routes[key])
      run(api(routes[key], { method: "POST", body: JSON.stringify(record) }));
  };

  const update = (key, id, patch) => {
    setData((current) => ({
      ...current,
      [key]: (current[key] || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
    const routes = {
      customers: "customers",
      departments: "departments",
      users: "users",
      inquiries: "inquiries",
      projects: "projects",
      documentTypes: "document-types",
    };
    if (routes[key])
      run(
        api(`/${routes[key]}/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      );
  };

  const updateCustomerMaster = (id, patch) => update("customers", id, patch);
  const updateDepartmentMaster = (id, patch) =>
    update("departments", id, patch);
  const updateUserMaster = (id, patch) => update("users", id, patch);

  const saveInquiryMasterVersion = (sections, formName = "", activate = true) =>
    runStrict(
      api("/masters/inquiry/versions", {
        method: "POST",
        body: JSON.stringify({ sections, form_name: formName, is_active: activate }),
      }),
    );
  const updateInquiryMasterVersion = (id, patch) =>
    runStrict(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const toggleInquiryMasterVersion = (id, active) =>
    run(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active }),
      }),
    );

  const saveProjectMasterVersion = (sections, formName = "", activate = true) =>
    runStrict(
      api("/masters/project/versions", {
        method: "POST",
        body: JSON.stringify({ sections, form_name: formName, is_active: activate }),
      }),
    );
  const updateProjectMasterVersion = (id, patch) =>
    runStrict(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const toggleProjectMasterVersion = (id, active) =>
    run(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active }),
      }),
    );

  const saveTicketMasterVersion = (sections, formName = "", activate = true) =>
    runStrict(
      api("/masters/ticket/versions", {
        method: "POST",
        body: JSON.stringify({ sections, form_name: formName, is_active: activate }),
      }),
    );
  const updateTicketMasterVersion = (id, patch) =>
    runStrict(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const toggleTicketMasterVersion = (id, active) =>
    run(
      api(`/form-versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active }),
      }),
    );

  const addPanelMaster = (record) =>
    runStrict(
      api("/panel-masters", { method: "POST", body: JSON.stringify(record) }),
    );
  const updatePanelMaster = (id, patch) =>
    runStrict(
      api(`/panel-masters/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const savePanelMasterVersion = (id, sections, formName = "", activate = true) =>
    runStrict(
      api(`/panel-masters/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ sections, form_name: formName, is_active: activate }),
      }),
    );
  const updatePanelMasterVersion = (_panelId, versionId, patch) =>
    runStrict(
      api(`/form-versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const togglePanelMasterVersion = (_panelId, versionId, active) =>
    run(
      api(`/form-versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active }),
      }),
    );

  const addPlanningTask = (department, taskName) =>
    run(
      api("/planning/tasks", {
        method: "POST",
        body: JSON.stringify({ department, name: taskName }),
      }),
    );
  const updatePlanningTask = (_department, taskId, patch) =>
    run(
      api(`/planning/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: patch.name,
          is_active: patch.is_active,
          display_order: patch.display_order,
        }),
      }),
    );
  const removePlanningTask = (_department, taskId) =>
    run(api(`/planning/tasks/${taskId}`, { method: "DELETE" }));
  const reorderPlanningTask = (department, fromIndex, toIndex) => {
    setData((current) => {
      const master = { ...(current.planningGridMaster || {}) };
      const map = { ...(master.department_tasks || {}) };
      const tasks = [...(map[department] || [])];
      const [moved] = tasks.splice(fromIndex, 1);
      tasks.splice(toIndex, 0, moved);
      map[department] = tasks;
      return {
        ...current,
        planningGridMaster: { ...master, department_tasks: map },
      };
    });
  };
  const updatePlanningGridMaster = (patch) =>
    setData((current) => ({
      ...current,
      planningGridMaster: { ...(current.planningGridMaster || {}), ...patch },
    }));
  const savePlanningGridVersion = (record) =>
    runStrict(
      api("/planning-grid/versions", {
        method: "POST",
        body: JSON.stringify(record),
      }),
    );
  const updatePlanningGridVersion = (id, patch) =>
    runStrict(
      api(`/planning-grid/versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  const activatePlanningGridVersion = (id) =>
    runStrict(
      api(`/planning-grid/versions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      }),
    );
  const addPlanningStatus = (status) =>
    setData((current) => ({
      ...current,
      planningGridMaster: {
        ...current.planningGridMaster,
        statuses: [...(current.planningGridMaster?.statuses || []), status],
      },
    }));
  const removePlanningStatus = (status) =>
    setData((current) => ({
      ...current,
      planningGridMaster: {
        ...current.planningGridMaster,
        statuses: (current.planningGridMaster?.statuses || []).filter(
          (x) => x !== status,
        ),
      },
    }));

  const addRecordDocument = async ({
    recordType,
    recordId,
    documentTypeId,
    file,
    originalFileName,
    description,
    versionNo = 1,
  }) => {
    if (!documentTypeId) {
      const error = new Error(
        "Select Document Type and Subtype before uploading.",
      );
      setBackendStatus((s) => ({ ...s, error: error.message }));
      throw error;
    }
    if (!file) {
      const error = new Error("Choose a real file before uploading.");
      setBackendStatus((s) => ({ ...s, error: error.message }));
      throw error;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("record_type", recordType);
    form.append("record_id", recordId);
    form.append("document_type_id", documentTypeId);
    form.append("description", description || "");
    form.append("document_name", originalFileName || file?.name || "");
    form.append("version_no", String(versionNo));
    try {
      const result = await api("/documents/upload", {
        method: "POST",
        body: form,
      });
      await refresh();
      setBackendStatus((state) => ({ ...state, error: "" }));
      return result;
    } catch (error) {
      setBackendStatus((state) => ({ ...state, error: error.message }));
      throw error;
    }
  };

  const value = useMemo(
    () => ({
      data,
      backendStatus,
      refresh,
      add,
      update,
      updateCustomerMaster,
      updateDepartmentMaster,
      updateUserMaster,
      saveInquiryMasterVersion,
      updateInquiryMasterVersion,
      toggleInquiryMasterVersion,
      saveProjectMasterVersion,
      updateProjectMasterVersion,
      toggleProjectMasterVersion,
      saveTicketMasterVersion,
      updateTicketMasterVersion,
      toggleTicketMasterVersion,
      updatePlanningGridMaster,
      savePlanningGridVersion,
      updatePlanningGridVersion,
      activatePlanningGridVersion,
      addPlanningTask,
      updatePlanningTask,
      removePlanningTask,
      reorderPlanningTask,
      addPlanningStatus,
      removePlanningStatus,
      addPanelMaster,
      updatePanelMaster,
      savePanelMasterVersion,
      updatePanelMasterVersion,
      togglePanelMasterVersion,
      addRecordDocument,
    }),
    [data, backendStatus, refresh],
  );
  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  PanelsTopLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { api, downloadApiFile } from "../api";
import {
  AlertDialog,
  Field,
  Input,
  PrimaryButton,
  SecondaryButton,
  Select,
  Status,
} from "../components/ui";
import DynamicForm, { validateDynamicForm } from "../components/DynamicForm";
import RecordDocuments from "../components/RecordDocuments";
import { DetailHeader, Info, SectionDataView } from "../components/RecordUI";
import { InquiryKickoffSummary } from "../components/MeetingSections";
import InquiryStatusModal from "../components/InquiryStatusModal";
import FixedTimelineFields, {
  addTimelineWeeks,
  timelineWeeksFromDates,
} from "../components/FixedTimelineFields";
import {
  collectDynamicDocumentDrafts,
  sanitizeDynamicDocumentValues,
  uploadDynamicDocumentDrafts,
} from "../utils/dynamicDocuments";

const cleanQty = (value) => Math.max(1, Number.parseInt(value, 10) || 1);

const makeSeparateGrid = (index = 0, panelData = {}, groupQty = 1) => ({
  _key: `grid-${Date.now()}-${index}-${Math.random()}`,
  unit_no: index + 1,
  group_qty: Math.max(1, Number.parseInt(groupQty, 10) || 1),
  panel_data: JSON.parse(JSON.stringify(panelData || {})),
});

const newPanel = (index = 0) => ({
  _key: `new-${Date.now()}-${index}-${Math.random()}`,
  panel_master_id: "",
  panel_no: `P-${String(index + 1).padStart(2, "0")}`,
  qty: 1,
  details_mode: "common",
  panel_data: {},
  separate_grids: [],
});

const allocatedQty = (grids = []) =>
  grids.reduce(
    (sum, grid) => sum + Math.max(1, Number.parseInt(grid.group_qty, 10) || 1),
    0,
  );

const normalizeSeparateGrids = (entry, qty, minimum = 0) => {
  const existing = Array.isArray(entry.separate_grids)
    ? entry.separate_grids
    : [];
  const target = Math.min(qty, Math.max(minimum, existing.length));
  const grids = existing.slice(0, target).map((grid, index) => ({
    ...grid,
    unit_no: index + 1,
    group_qty: Math.max(1, Number.parseInt(grid.group_qty, 10) || 1),
    panel_data: grid.panel_data || {},
  }));
  while (grids.length < target)
    grids.push(
      makeSeparateGrid(
        grids.length,
        grids.length === 0 ? entry.panel_data : {},
        1,
      ),
    );
  if (!grids.length) return grids;
  let total = allocatedQty(grids);
  if (total < qty)
    grids[grids.length - 1] = {
      ...grids[grids.length - 1],
      group_qty: grids[grids.length - 1].group_qty + (qty - total),
    };
  if (total > qty) {
    let extra = total - qty;
    for (let index = grids.length - 1; index >= 0 && extra > 0; index -= 1) {
      const reducible = Math.max(0, grids[index].group_qty - 1);
      const reduceBy = Math.min(reducible, extra);
      grids[index] = {
        ...grids[index],
        group_qty: grids[index].group_qty - reduceBy,
      };
      extra -= reduceBy;
    }
  }
  return grids.map((grid, index) => ({ ...grid, unit_no: index + 1 }));
};

export default function InquiryDetailPage({ editable = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useStore();
  const hasUpdatePermission = (data.currentUser?.permissions || []).includes('INQUIRIES.UPDATE');

  const record = useMemo(
    () => (data.inquiries || []).find((item) => item.id === id),
    [data.inquiries, id],
  );
  const canUpdate = hasUpdatePermission && record?.can_edit !== false;
  const masterVersion = useMemo(() => {
    const versions = data.inquiryMaster?.versions || [];
    return record?.master_version_id
      ? versions.find((version) => version.id === record.master_version_id) ||
          null
      : versions.find((version) => version.is_active) || null;
  }, [data.inquiryMaster, record]);
  const recordPanelIds = new Set(
    (record?.panel_instances?.length
      ? record.panel_instances
      : record?.panels || []
    )
      .map((panel) => panel.panel_master_id || panel.panel_id)
      .filter(Boolean),
  );
  const activePanels = (data.panelMasters || []).filter(
    (panel) =>
      recordPanelIds.has(panel.id) ||
      (panel.is_active !== false &&
        panel.versions?.some((version) => version.is_active)),
  );
  const customers = (data.customers || []).filter((c) => c.is_active !== false);

  const legacyInstances = record?.panel_instances?.length
    ? record.panel_instances.map((entry, index) => ({
        ...entry,
        _key:
          entry._key ||
          `saved-${entry.panel_master_id || entry.panel_id || index}-${index}`,
        qty: cleanQty(entry.qty),
        details_mode:
          cleanQty(entry.qty) > 1 ? entry.details_mode || "common" : "common",
        panel_data: entry.panel_data || {},
        separate_grids: Array.isArray(entry.separate_grids)
          ? entry.separate_grids.map((grid, gridIndex) => ({
              ...grid,
              _key: grid._key || `saved-grid-${index}-${gridIndex}`,
              unit_no: gridIndex + 1,
              group_qty: Math.max(1, Number.parseInt(grid.group_qty, 10) || 1),
              panel_data: grid.panel_data || {},
            }))
          : [],
      }))
    : (record?.panels || []).map((entry, index) => {
        const panel = data.panelMasters?.find(
          (item) => item.id === (entry.panel_id || entry.panel_master_id),
        );
        const version = entry.panel_version_id
          ? panel?.versions?.find((item) => item.id === entry.panel_version_id)
          : panel?.versions?.find((item) => item.is_active);
        return {
          ...entry,
          _key: `legacy-${entry.panel_id || index}-${index}`,
          panel_master_id: entry.panel_master_id || entry.panel_id || "",
          panel_id: entry.panel_id || entry.panel_master_id || "",
          panel_type:
            entry.panel_type || entry.panel || panel?.panel_type || "",
          panel_code: entry.panel_code || panel?.panel_code || "",
          panel_version_id: entry.panel_version_id || version?.id || null,
          panel_data: entry.panel_data || {},
          qty: cleanQty(entry.qty),
          details_mode: "common",
          separate_grids: [],
        };
      });

  const [form, setForm] = useState(() =>
    record
      ? {
          customer_id: record.customer_id || "",
          project_name: record.project_name || "",
          inquiry_date: record.inquiry_date || "",
          timeline_weeks:
            record.timeline_weeks ||
            timelineWeeksFromDates(
              record.inquiry_date || "",
              record.order_expected_end_date || record.expected_end_date || "",
            ),
          order_expected_end_date:
            record.order_expected_end_date || record.expected_end_date || "",
          actual_end_date: record.actual_end_date || "",
          status: record.status || "New",
          general_data: JSON.parse(
            JSON.stringify(record.general_data || record.dynamic_data || {}),
          ),
          panel_instances: JSON.parse(JSON.stringify(legacyInstances)),
        }
      : null,
  );
  const [errors, setErrors] = useState({});
  const [statusOpen, setStatusOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");

  const downloadPdf = async () => {
    if (!record?.id || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const projectPart = record.project_no ? `-${record.project_no}` : "";
      await downloadApiFile(
        `/inquiries/${record.id}/pdf`,
        `Inquiry-${record.inquiry_no}${projectPart}.pdf`,
      );
    } catch (error) {
      setDialogMessage(error.message || "Unable to generate Inquiry PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!record || !form)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Inquiry not found.
      </div>
    );

  if (editable && !canUpdate)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        You do not have permission to edit this inquiry.
      </div>
    );

  const panelVersion = (instance) => {
    const panel = data.panelMasters?.find(
      (p) => p.id === instance.panel_master_id,
    );
    return instance.panel_version_id
      ? panel?.versions?.find(
          (version) => version.id === instance.panel_version_id,
        ) || null
      : panel?.versions?.find((version) => version.is_active) || null;
  };

  const updatePanelAt = (index, updater) => {
    setForm((prev) => ({
      ...prev,
      panel_instances: prev.panel_instances.map((panel, idx) =>
        idx === index ? updater(panel) : panel,
      ),
    }));
  };

  const updatePanelQty = (index, value) =>
    updatePanelAt(index, (panel) => {
      const qty = cleanQty(value);
      if (qty === 1)
        return { ...panel, qty, details_mode: "common", separate_grids: [] };
      return {
        ...panel,
        qty,
        separate_grids:
          panel.details_mode === "separate"
            ? normalizeSeparateGrids(panel, qty, Math.min(2, qty))
            : [],
      };
    });

  const setPanelMode = (index, mode) =>
    updatePanelAt(index, (panel) => {
      const qty = cleanQty(panel.qty);
      if (qty <= 1 || mode === "common")
        return { ...panel, details_mode: "common", separate_grids: [] };
      return {
        ...panel,
        details_mode: "separate",
        separate_grids: normalizeSeparateGrids(panel, qty, Math.min(2, qty)),
      };
    });

  const updateSeparateGridQty = (index, gridIndex, value) =>
    updatePanelAt(index, (panel) => ({
      ...panel,
      separate_grids: (panel.separate_grids || []).map((grid, idx) =>
        idx === gridIndex
          ? { ...grid, group_qty: Math.max(1, Number.parseInt(value, 10) || 1) }
          : grid,
      ),
    }));

  const addSeparateGrid = (index) =>
    updatePanelAt(index, (panel) => {
      const qty = cleanQty(panel.qty);
      const grids = [...(panel.separate_grids || [])];
      if (grids.length >= qty) return panel;
      let splitIndex = -1;
      for (let i = grids.length - 1; i >= 0; i -= 1)
        if ((grids[i].group_qty || 1) > 1) {
          splitIndex = i;
          break;
        }
      if (splitIndex < 0) return panel;
      grids[splitIndex] = {
        ...grids[splitIndex],
        group_qty: grids[splitIndex].group_qty - 1,
      };
      grids.push(makeSeparateGrid(grids.length, {}, 1));
      return {
        ...panel,
        separate_grids: grids.map((grid, idx) => ({
          ...grid,
          unit_no: idx + 1,
        })),
      };
    });

  const removeSeparateGrid = (index, gridIndex) =>
    updatePanelAt(index, (panel) => {
      const grids = [...(panel.separate_grids || [])];
      if (grids.length <= 2) return panel;
      const removed = grids.splice(gridIndex, 1)[0];
      const mergeIndex = Math.max(0, gridIndex - 1);
      grids[mergeIndex] = {
        ...grids[mergeIndex],
        group_qty:
          (grids[mergeIndex].group_qty || 1) + (removed?.group_qty || 1),
      };
      return {
        ...panel,
        separate_grids: grids.map((grid, idx) => ({
          ...grid,
          unit_no: idx + 1,
        })),
      };
    });

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.customer_id) next.customer_id = "Customer is required.";
    if (!form.project_name.trim())
      next.project_name = "Project Name is required.";
    if (!form.inquiry_date) next.start_date = "Start Date is required.";
    if (
      !Number.isFinite(Number(form.timeline_weeks)) ||
      Number(form.timeline_weeks) <= 0
    )
      next.timeline_weeks =
        "Enter a positive timeline, for example 0.5 or 2 weeks.";

    const general = validateDynamicForm(
      masterVersion?.sections || [],
      form.general_data,
    );
    if (!general.isValid) next.general = general.errors;
    if (!form.panel_instances.length)
      next.panels = "At least one panel is required.";

    const panelFieldErrors = {};
    form.panel_instances.forEach((panel, index) => {
      if (!panel.panel_master_id) {
        panelFieldErrors[index] = { _panel: "Select panel type." };
        return;
      }
      const version = panelVersion(panel);
      const qty = cleanQty(panel.qty);
      const mode = qty > 1 ? panel.details_mode || "common" : "common";

      if (mode === "separate") {
        const grids = panel.separate_grids || [];
        const gridErrors = {};
        const allocated = allocatedQty(grids);
        if (grids.length < 2 || allocated !== qty) {
          panelFieldErrors[index] = {
            _gridCount: `Separate forms must allocate exactly ${qty} qty. Currently allocated: ${allocated}.`,
            _grids: gridErrors,
          };
          return;
        }
        grids.forEach((grid, gridIndex) => {
          const validation = validateDynamicForm(
            version?.sections || [],
            grid.panel_data || {},
          );
          if (!validation.isValid) gridErrors[gridIndex] = validation.errors;
        });
        if (Object.keys(gridErrors).length)
          panelFieldErrors[index] = { _grids: gridErrors };
      } else {
        const validation = validateDynamicForm(
          version?.sections || [],
          panel.panel_data || {},
        );
        if (!validation.isValid) panelFieldErrors[index] = validation.errors;
      }
    });
    if (Object.keys(panelFieldErrors).length)
      next.panelFields = panelFieldErrors;

    setErrors(next);
    setSaveError("");
    if (Object.keys(next).length) return;

    const dynamicDocumentDrafts = [
      ...collectDynamicDocumentDrafts(
        masterVersion?.sections || [],
        form.general_data || {},
      ),
      ...form.panel_instances.flatMap((panel) => {
        const version = panelVersion(panel);
        if (!version?.sections?.length) return [];
        if (cleanQty(panel.qty) > 1 && panel.details_mode === "separate") {
          return (panel.separate_grids || []).flatMap((grid) =>
            collectDynamicDocumentDrafts(
              version.sections,
              grid.panel_data || {},
            ),
          );
        }
        return collectDynamicDocumentDrafts(
          version.sections,
          panel.panel_data || {},
        );
      }),
    ];

    const instances = form.panel_instances.map((panel) => {
      const panelMaster =
        activePanels.find((x) => x.id === panel.panel_master_id) ||
        data.panelMasters?.find((x) => x.id === panel.panel_master_id);
      const version = panelVersion(panel);
      const qty = cleanQty(panel.qty);
      const detailsMode = qty > 1 ? panel.details_mode || "common" : "common";
      return {
        ...panel,
        qty,
        details_mode: detailsMode,
        panel_id: panel.panel_master_id,
        panel_type: panelMaster?.panel_type || panel.panel_type || "",
        panel: panelMaster?.panel_type || panel.panel || "",
        panel_code: panelMaster?.panel_code || panel.panel_code || "",
        panel_version_id: version?.id || panel.panel_version_id || null,
        panel_data: sanitizeDynamicDocumentValues(panel.panel_data || {}),
        separate_grids:
          detailsMode === "separate"
            ? (panel.separate_grids || []).map((grid, gridIndex) => ({
                ...grid,
                unit_no: gridIndex + 1,
                group_qty: Math.max(
                  1,
                  Number.parseInt(grid.group_qty, 10) || 1,
                ),
                panel_data: sanitizeDynamicDocumentValues(
                  grid.panel_data || {},
                ),
              }))
            : [],
      };
    });

    const customer = customers.find((c) => c.id === form.customer_id);
    const payload = {
      inquiry_no: record.inquiry_no,
      customer_id: form.customer_id,
      customer: customer?.customer_name || record.customer,
      project_name: form.project_name.trim(),
      inquiry_date: form.inquiry_date,
      timeline_weeks: Number(form.timeline_weeks),
      order_expected_end_date:
        form.order_expected_end_date ||
        addTimelineWeeks(form.inquiry_date, form.timeline_weeks),
      expected_end_date:
        form.order_expected_end_date ||
        addTimelineWeeks(form.inquiry_date, form.timeline_weeks),
      actual_end_date: form.actual_end_date || "",
      status: record.status,
      qty: record.qty || 1,
      master_version_id: record.master_version_id || masterVersion?.id || null,
      general_data: sanitizeDynamicDocumentValues(form.general_data || {}),
      panel_instances: instances,
      panels: instances.map((panel) => ({
        panel_id: panel.panel_master_id,
        panel_no: panel.panel_no,
        panel: panel.panel_type,
        qty: panel.qty,
      })),
    };

    setSaving(true);
    try {
      await api(`/inquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (dynamicDocumentDrafts.length)
        await uploadDynamicDocumentDrafts(
          api,
          "inquiry",
          id,
          dynamicDocumentDrafts,
        );
      await refresh();
      navigate("/inquiries");
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editable)
    return (
      <div className="fade-in mx-auto max-w-[1550px]">
        <DetailHeader
          title={record.inquiry_no}
          subtitle={`Inquiry · Master v${masterVersion?.version_no || "—"} · Read-only view`}
          onBack={() => navigate("/inquiries")}
          onEdit={canUpdate ? () => navigate(`/inquiries/${id}/edit`) : undefined}
          actions={
            <SecondaryButton
              type="button"
              onClick={downloadPdf}
              disabled={downloadingPdf}
            >
              <Download size={14} />{" "}
              {downloadingPdf ? "Generating PDF..." : "Download PDF"}
            </SecondaryButton>
          }
        />
        {record.amendment && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">Amendment</p>
              <p className="text-xs">{record.amendment_message}</p>
            </div>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Customer" value={record.customer} />
          <Info label="Project Name" value={record.project_name} />
          <Info
            label="Status"
            value={
              <div>
                <Status value={record.status} />
                {(record.status_reason || record.status_remark) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[record.status_reason, record.status_remark]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            }
          />
        </div>
        <FixedTimelineFields
          value={{
            start_date: record.inquiry_date || "",
            timeline_weeks: record.timeline_weeks,
            expected_end_date:
              record.order_expected_end_date || record.expected_end_date,
            actual_end_date: record.actual_end_date,
          }}
          readOnly
        />

        {masterVersion?.sections?.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-slate-900">
              Inquiry Information
            </h3>
            <SectionDataView
              sections={masterVersion.sections}
              values={record.general_data || record.dynamic_data || {}}
            />
          </section>
        )}

        <section className="mt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
            <PanelsTopLeft size={16} className="text-blue-600" />
            Panel Details
          </h3>
          <div className="space-y-3">
            {legacyInstances.map((panel, index) => {
              const version = panelVersion(panel);
              const qty = cleanQty(panel.qty);
              const separate = qty > 1 && panel.details_mode === "separate";
              return (
                <div
                  key={`${panel.panel_no}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="Panel No." value={panel.panel_no} />
                    <Info
                      label="Panel Type"
                      value={`${panel.panel_code || ""}${panel.panel_code ? " · " : ""}${panel.panel_type || panel.panel}`}
                    />
                    <Info label="Qty" value={qty} />
                    <Info
                      label="Details"
                      value={
                        qty > 1 ? (separate ? "Separate" : "Common") : "Single"
                      }
                    />
                  </div>
                  {version?.sections?.length > 0 &&
                    (separate ? (
                      <div className="space-y-2">
                        {(panel.separate_grids || []).map((grid, gridIndex) => (
                          <div
                            key={grid._key || gridIndex}
                            className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-800">
                                {panel.panel_no || "Panel"} · Separate Form{" "}
                                {gridIndex + 1}
                              </p>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                Qty {grid.group_qty || 1}
                              </span>
                            </div>
                            <SectionDataView
                              sections={version.sections}
                              values={grid.panel_data || {}}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        {qty > 1 && (
                          <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                            Common details apply to all {qty} panels.
                          </div>
                        )}
                        <SectionDataView
                          sections={version.sections}
                          values={panel.panel_data || {}}
                        />
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </section>
        {record.status === "Order Won" && (
          <InquiryKickoffSummary inquiryId={id} />
        )}
        <RecordDocuments recordType="inquiry" recordId={id} />
        <AlertDialog
          open={Boolean(dialogMessage)}
          title="Unable to Generate PDF"
          message={dialogMessage}
          onClose={() => setDialogMessage("")}
        />
      </div>
    );

  return (
    <div className="fade-in mx-auto max-w-[1550px] pb-4">
      <DetailHeader
        title={`Edit ${record.inquiry_no}`}
        subtitle={`Inquiry · Master v${masterVersion?.version_no || "—"} · Edit page`}
        editing
        onBack={() => navigate("/inquiries")}
      />
      <form onSubmit={save} className="space-y-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer" required>
              <Select
                value={form.customer_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, customer_id: e.target.value }))
                }
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_name}
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
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, project_name: e.target.value }))
                }
              />
              {errors.project_name && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.project_name}
                </p>
              )}
            </Field>
            <Field label="Status">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Status value={record.status} />
                </div>
                <SecondaryButton
                  type="button"
                  onClick={() => setStatusOpen(true)}
                  className="!px-3"
                >
                  Change
                </SecondaryButton>
              </div>
            </Field>
          </div>
          <FixedTimelineFields
            value={{
              start_date: form.inquiry_date,
              timeline_weeks: form.timeline_weeks,
              expected_end_date: form.order_expected_end_date,
              actual_end_date: form.actual_end_date,
            }}
            onChange={(schedule) =>
              setForm((prev) => ({
                ...prev,
                inquiry_date: schedule.start_date,
                timeline_weeks: schedule.timeline_weeks,
                order_expected_end_date: schedule.expected_end_date,
                actual_end_date: schedule.actual_end_date,
              }))
            }
            errors={errors}
          />
          {masterVersion?.sections?.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <DynamicForm
                embedded
                sections={masterVersion.sections}
                values={form.general_data}
                onChange={(fieldId, value) =>
                  setForm((prev) => ({
                    ...prev,
                    general_data: { ...prev.general_data, [fieldId]: value },
                  }))
                }
                errors={errors.general || {}}
              />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Panel Details</h3>
              <p className="text-xs text-slate-400">
                Qty greater than 1 supports Common or Separate panel details.
              </p>
            </div>
            <SecondaryButton
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  panel_instances: [
                    ...prev.panel_instances,
                    newPanel(prev.panel_instances.length),
                  ],
                }))
              }
            >
              <Plus size={14} /> Add Panel
            </SecondaryButton>
          </div>
          {errors.panels && (
            <p className="mb-2 text-xs font-semibold text-rose-600">
              {errors.panels}
            </p>
          )}
          <div className="space-y-3">
            {form.panel_instances.map((panel, index) => {
              const panelMaster = data.panelMasters?.find(
                (x) => x.id === panel.panel_master_id,
              );
              const version = panelVersion(panel);
              const qty = cleanQty(panel.qty);
              return (
                <div
                  key={panel._key || index}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                >
                  <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[120px_minmax(0,1fr)_100px_40px]">
                    <Field label="Panel No.">
                      <Input
                        value={panel.panel_no}
                        onChange={(e) =>
                          updatePanelAt(index, (current) => ({
                            ...current,
                            panel_no: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Panel Type" required>
                      <Select
                        value={panel.panel_master_id}
                        onChange={(e) => {
                          const selected = activePanels.find(
                            (x) => x.id === e.target.value,
                          );
                          const activeVersion = selected?.versions?.find(
                            (v) => v.is_active,
                          );
                          updatePanelAt(index, (current) => ({
                            ...current,
                            panel_master_id: e.target.value,
                            panel_version_id: activeVersion?.id || null,
                            panel_data: {},
                            details_mode: "common",
                            separate_grids: [],
                          }));
                        }}
                      >
                        <option value="">Select panel</option>
                        {activePanels.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.panel_code} · {item.panel_type}
                          </option>
                        ))}
                      </Select>
                      {errors.panelFields?.[index]?._panel && (
                        <p className="mt-1 text-xs text-rose-600">
                          {errors.panelFields[index]._panel}
                        </p>
                      )}
                    </Field>
                    <Field label="Qty">
                      <Input
                        type="number"
                        min="1"
                        value={panel.qty}
                        onChange={(e) => updatePanelQty(index, e.target.value)}
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            panel_instances: prev.panel_instances.filter(
                              (_, idx) => idx !== index,
                            ),
                          }))
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {panelMaster && (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">
                        {panelMaster.panel_code} · v{version?.version_no}
                      </span>
                      {qty > 1 && (
                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setPanelMode(index, "common")}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${panel.details_mode !== "separate" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                          >
                            Common
                          </button>
                          <button
                            type="button"
                            onClick={() => setPanelMode(index, "separate")}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${panel.details_mode === "separate" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                          >
                            Separate
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {errors.panelFields?.[index]?._gridCount && (
                    <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {errors.panelFields[index]._gridCount}
                    </div>
                  )}

                  {panelMaster &&
                    version?.sections?.length > 0 &&
                    (qty > 1 && panel.details_mode === "separate" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] text-indigo-700">
                          <span>
                            Each form can cover one or more identical panels.
                          </span>
                          <span className="font-bold">
                            Allocated {allocatedQty(panel.separate_grids || [])}{" "}
                            / {qty}
                          </span>
                        </div>
                        {(panel.separate_grids || []).map((grid, gridIndex) => (
                          <div
                            key={grid._key || gridIndex}
                            className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm"
                          >
                            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {panel.panel_no || "Panel"} · Separate Form{" "}
                                  {gridIndex + 1}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  These details apply to the quantity entered
                                  for this form.
                                </p>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="w-24">
                                  <Field label="Qty">
                                    <Input
                                      type="number"
                                      min="1"
                                      max={qty}
                                      value={grid.group_qty || 1}
                                      onChange={(e) =>
                                        updateSeparateGridQty(
                                          index,
                                          gridIndex,
                                          e.target.value,
                                        )
                                      }
                                      className="!py-1.5"
                                    />
                                  </Field>
                                </div>
                                {(panel.separate_grids || []).length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSeparateGrid(index, gridIndex)
                                    }
                                    className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <DynamicForm
                              embedded
                              sections={version.sections}
                              values={grid.panel_data || {}}
                              onChange={(fieldId, value) =>
                                updatePanelAt(index, (current) => ({
                                  ...current,
                                  separate_grids: (
                                    current.separate_grids || []
                                  ).map((item, idx) =>
                                    idx === gridIndex
                                      ? {
                                          ...item,
                                          panel_data: {
                                            ...item.panel_data,
                                            [fieldId]: value,
                                          },
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              errors={
                                errors.panelFields?.[index]?._grids?.[
                                  gridIndex
                                ] || {}
                              }
                            />
                          </div>
                        ))}
                        {(panel.separate_grids || []).length < qty &&
                          (panel.separate_grids || []).some(
                            (grid) => (grid.group_qty || 1) > 1,
                          ) && (
                            <div className="flex justify-center pt-1">
                              <SecondaryButton
                                type="button"
                                onClick={() => addSeparateGrid(index)}
                                className="!border-indigo-200 !bg-indigo-50 !px-3 !py-2 !text-xs !font-semibold !text-indigo-700 hover:!bg-indigo-100"
                              >
                                <Plus size={13} /> Add Separate Form
                              </SecondaryButton>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                          {qty > 1
                            ? `Common details apply to all ${qty} panels.`
                            : "Panel-specific details."}
                        </div>
                        <DynamicForm
                          embedded
                          sections={version.sections}
                          values={panel.panel_data || {}}
                          onChange={(fieldId, value) =>
                            updatePanelAt(index, (current) => ({
                              ...current,
                              panel_data: {
                                ...current.panel_data,
                                [fieldId]: value,
                              },
                            }))
                          }
                          errors={errors.panelFields?.[index] || {}}
                        />
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </section>

        <RecordDocuments recordType="inquiry" recordId={id} />
        {statusOpen && (
          <InquiryStatusModal
            inquiry={record}
            onClose={() => setStatusOpen(false)}
            onChanged={refresh}
          />
        )}
        {saveError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {saveError}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={() => navigate("/inquiries")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
      <AlertDialog
        open={Boolean(dialogMessage)}
        title="Unable to Generate PDF"
        message={dialogMessage}
        onClose={() => setDialogMessage("")}
      />
    </div>
  );
}

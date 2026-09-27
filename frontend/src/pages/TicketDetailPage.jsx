import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import { api, downloadApiFile } from "../api";
import { useStore } from "../store";
import {
  Field,
  Input,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Select,
  Textarea,
} from "../components/ui";
import { DetailHeader, Info } from "../components/RecordUI";
import DynamicForm from "../components/DynamicForm";
import RepairDetailsFields, {
  EMPTY_REPAIR_VALUE,
  buildPhase2Payload,
  isInHouseRepair,
  validateRepairValue,
} from "../components/RepairDetailsFields";
import {
  ticketCoreOptions,
  ticketDynamicSections,
} from "../utils/ticketFormOptions";

const phaseOf = (title = "") =>
  /^phase\s*2\b/i.test(title) ? 2 : /^phase\s*1\b/i.test(title) ? 1 : 0;
const isCoreSection = (title = "") =>
  String(title).toLowerCase().includes("core dropdown");

const emptyForm = () => ({
  subject: "",
  customer_id: "",
  ticket_type: "",
  problem_type: "",
  manufacturer: "",
  model_number: "",
  received_via: "",
  warranty_status: "",
  support_mode: "",
  support_type: "",
  priority: "Medium",
  complaint: "",
  customer_comment: "",
  inquiry_id: "",
  project_id: "",
});

function humanSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function TicketDetailPage({
  createMode = false,
  editable = false,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useStore();
  const permissions = data.currentUser?.permissions || [];
  const ticketDepartments = new Set(["AUTOMATION", "STORE"]);
  const isTicketWriteDept =
    data.currentUser?.role_code === "ADMIN" ||
    (data.currentUser?.departments || []).some((name) =>
      ticketDepartments.has(String(name || "").trim().toUpperCase()),
    );
  const canUpdate = permissions.includes("TICKETS.UPDATE") && isTicketWriteDept;
  const canAssign = permissions.includes("TICKETS.ASSIGN");

  const ticket = useMemo(
    () => (data.tickets || []).find((item) => item.id === id) || null,
    [data.tickets, id],
  );
  const activeTicketVersion = useMemo(
    () =>
      (data.ticketMaster?.versions || []).find((item) => item.is_active) ||
      (data.ticketMaster?.versions || [])[0],
    [data.ticketMaster],
  );
  const ticketVersion = useMemo(() => {
    if (!ticket?.ticket_form_version_id) return activeTicketVersion;
    return (
      (data.ticketMaster?.versions || []).find(
        (item) => item.id === ticket.ticket_form_version_id,
      ) || null
    );
  }, [data.ticketMaster, ticket, activeTicketVersion]);
  const sections = ticketVersion?.sections || [];
  const structuralSections = ticketDynamicSections(sections).filter(
    (section) => !isCoreSection(section.title),
  );
  const phase1Sections = structuralSections.filter(
    (s) => phaseOf(s.title) !== 2,
  );
  const phase2Sections = structuralSections.filter(
    (s) => phaseOf(s.title) === 2,
  );
  const coreOptions = ticketCoreOptions(sections);

  const [form, setForm] = useState(emptyForm);
  const [phase1Data, setPhase1Data] = useState({});
  const [files, setFiles] = useState([]);
  const [repair, setRepair] = useState(EMPTY_REPAIR_VALUE);
  const [phase2Data, setPhase2Data] = useState({});
  const [showAssign, setShowAssign] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState(null);

  if (!createMode && ticket && hydratedId !== ticket.id) {
    setForm({
      subject: ticket.subject || "",
      customer_id: ticket.customer_id || "",
      ticket_type: ticket.ticket_type || "",
      problem_type: ticket.problem_type || "",
      manufacturer: ticket.manufacturer || "",
      model_number: ticket.model_number || "",
      received_via: ticket.received_via || "",
      warranty_status: ticket.warranty_status || "",
      support_mode: ticket.support_mode || "",
      support_type: ticket.support_type || "",
      priority: ticket.priority || "Medium",
      complaint: ticket.complaint || "",
      customer_comment: ticket.customer_comment || "",
      inquiry_id: ticket.inquiry_id || "",
      project_id: ticket.project_id || "",
    });
    setPhase1Data(ticket.phase1_data || ticket.ticket_data || {});
    setPhase2Data(ticket.phase2_data || {});
    setRepair({
      repair_location: ticket.repair_location || "",
      department_ids: (ticket.assignments || [])
        .filter((a) => a.is_active !== false && a.department_id)
        .map((a) => a.department_id)
        .filter((v, i, arr) => arr.indexOf(v) === i),
      user_ids: (ticket.assignments || [])
        .filter((a) => a.is_active !== false && a.user_id)
        .map((a) => a.user_id),
      repair_details: {
        company_name: ticket.repair_details?.company_name || "",
        contact_number: ticket.repair_details?.contact_number || "",
        payment_amount: ticket.repair_details?.payment_amount ?? "",
      },
    });
    setHydratedId(ticket.id);
  }

  if (!createMode && !ticket) {
    return (
      <div className="fade-in">
        <PageHeader title="Ticket" description="Ticket not found." />
        <SecondaryButton onClick={() => navigate("/tickets")}>
          Back to Tickets
        </SecondaryButton>
      </div>
    );
  }

  const setField = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const requiredMissing = () => {
    const required = [
      ["subject", "Subject"],
      ["customer_id", "Customer"],
      ["ticket_type", "Ticket Type"],
      ["problem_type", "Problem Type"],
      ["model_number", "Model Number"],
      ["complaint", "Problem Description"],
      ["support_mode", "Support Location"],
      ["support_type", "Support Type"],
    ];
    const missing = required.filter(([key]) => !String(form[key] || "").trim());
    return missing.map(([, label]) => label);
  };

  const submitIntake = async (event) => {
    event.preventDefault();
    setError("");
    const missing = requiredMissing();
    if (missing.length) {
      setError(
        `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`,
      );
      return;
    }
    setSaving(true);
    try {
      if (createMode) {
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) =>
          body.append(key, value ?? ""),
        );
        body.append("ticket_data", JSON.stringify(phase1Data));
        files.forEach((file) => body.append("attachments", file));
        const res = await api("/tickets", { method: "POST", body });
        await refresh();
        navigate(`/tickets/${res.id}/view`);
      } else {
        await api(`/tickets/${ticket.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            ticket_data: JSON.stringify(phase1Data),
          }),
        });
        await refresh();
        navigate(`/tickets/${ticket.id}/view`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitPhase2 = async () => {
    setError("");
    const message = validateRepairValue(repair);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    try {
      await api(`/tickets/${ticket.id}/phase-2`, {
        method: "PUT",
        body: JSON.stringify({
          ...buildPhase2Payload(repair),
          phase_2_data: JSON.stringify(phase2Data),
        }),
      });
      await refresh();
      setShowAssign(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = () =>
    downloadApiFile(
      `/tickets/${ticket.id}/pdf`,
      `${ticket.ticket_no}.pdf`,
    ).catch((err) => setError(err.message));
  const downloadRmaPdf = () =>
    downloadApiFile(
      `/tickets/${ticket.id}/rma/pdf`,
      `${ticket.rma_no}.pdf`,
    ).catch((err) => setError(err.message));

  // ---------------------------------------------------------------- create / edit intake form
  if ((createMode || editable) && !isTicketWriteDept) {
    return (
      <div className="fade-in mx-auto max-w-4xl">
        <DetailHeader
          title="Not available"
          subtitle="Only the Automation and Store departments can create or edit tickets."
          onBack={() =>
            navigate(createMode ? "/tickets" : `/tickets/${ticket?.id ? `${ticket.id}/view` : ""}`)
          }
        />
      </div>
    );
  }
  if (createMode || editable) {
    return (
      <div className="fade-in mx-auto max-w-4xl">
        <DetailHeader
          title={
            createMode ? "New Ticket" : `Edit Ticket · ${ticket.ticket_no}`
          }
          subtitle={`Ticket information and technical problem details · Form v${ticketVersion?.version_no || "—"}`}
          editing
          onBack={() =>
            navigate(createMode ? "/tickets" : `/tickets/${ticket.id}/view`)
          }
        />
        <form onSubmit={submitIntake} className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Subject" required>
                  <Input
                    required
                    value={form.subject}
                    onChange={(e) => setField("subject", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Customer" required>
                <Select
                  required
                  value={form.customer_id}
                  onChange={(e) => setField("customer_id", e.target.value)}
                >
                  <option value="">Select customer</option>
                  {(data.customers || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customer_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ticket Type" required>
                <Select
                  required
                  value={form.ticket_type}
                  onChange={(e) => setField("ticket_type", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.TICKET_TYPE || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Problem Type" required>
                <Select
                  required
                  value={form.problem_type}
                  onChange={(e) => setField("problem_type", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.PROBLEM_TYPE || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Make / Manufacturer">
                <Select
                  value={form.manufacturer}
                  onChange={(e) => setField("manufacturer", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.MANUFACTURER || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Model Number" required>
                <Input
                  required
                  value={form.model_number}
                  onChange={(e) => setField("model_number", e.target.value)}
                />
              </Field>
              <Field label="Received Through">
                <Select
                  value={form.received_via}
                  onChange={(e) => setField("received_via", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.RECEIVED_VIA || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Warranty">
                <Select
                  value={form.warranty_status}
                  onChange={(e) => setField("warranty_status", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.WARRANTY_STATUS || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Support Location" required>
                <Select
                  required
                  value={form.support_mode}
                  onChange={(e) => setField("support_mode", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.SUPPORT_MODE || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Support Type" required>
                <Select
                  required
                  value={form.support_type}
                  onChange={(e) => setField("support_type", e.target.value)}
                >
                  <option value="">Select</option>
                  {(coreOptions.SUPPORT_TYPE || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select
                  value={form.priority}
                  onChange={(e) => setField("priority", e.target.value)}
                >
                  {(coreOptions.PRIORITY || []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Inquiry Reference">
                <Select
                  value={form.inquiry_id}
                  onChange={(e) => setField("inquiry_id", e.target.value)}
                >
                  <option value="">None</option>
                  {(data.inquiries || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.inquiry_no} · {item.customer}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project Reference">
                <Select
                  value={form.project_id}
                  onChange={(e) => setField("project_id", e.target.value)}
                >
                  <option value="">None</option>
                  {(data.projects || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.project_no} · {item.customer}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Problem Description" required>
                <Textarea
                  required
                  rows={4}
                  value={form.complaint}
                  onChange={(e) => setField("complaint", e.target.value)}
                />
              </Field>
              <Field label="Customer Comment">
                <Textarea
                  rows={4}
                  value={form.customer_comment}
                  onChange={(e) => setField("customer_comment", e.target.value)}
                />
              </Field>
            </div>
            {createMode && (
              <div className="mt-3">
                <Field label="Attachments / Photos">
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Up to 10 files.
                  </p>
                </Field>
              </div>
            )}
          </section>

          {phase1Sections.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Additional Details
              </h3>
              <DynamicForm
                sections={phase1Sections}
                values={phase1Data}
                onChange={setPhase1Data}
                embedded
              />
            </section>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <SecondaryButton
              type="button"
              onClick={() =>
                navigate(createMode ? "/tickets" : `/tickets/${ticket.id}/view`)
              }
              disabled={saving}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={saving}>
              {saving
                ? "Saving…"
                : createMode
                  ? "Submit Ticket"
                  : "Save Changes"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  // ---------------------------------------------------------------------------------- view mode
  const location = ticket.repair_location || "";
  const details = ticket.repair_details || {};
  const team = (ticket.assignments || []).filter(
    (a) => a.is_active !== false && a.user,
  );

  return (
    <div className="fade-in">
      <DetailHeader
        title={ticket.subject}
        subtitle={`${ticket.ticket_no} · ${ticket.customer} · Form v${ticketVersion?.version_no || "—"}`}
        onBack={() => navigate("/tickets")}
        onEdit={canUpdate ? () => navigate(`/tickets/${ticket.id}/edit`) : null}
        actions={
          <>
            <SecondaryButton type="button" onClick={downloadPdf}>
              <Download size={14} /> Ticket PDF
            </SecondaryButton>
            {ticket.rma_no && (
              <SecondaryButton type="button" onClick={downloadRmaPdf}>
                <Download size={14} /> RMA PDF
              </SecondaryButton>
            )}
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">
              Ticket Summary
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Ticket Type" value={ticket.ticket_type} />
              <Info label="Problem Type" value={ticket.problem_type} />
              <Info label="Make / Manufacturer" value={ticket.manufacturer} />
              <Info label="Model Number" value={ticket.model_number} />
              <Info label="Received Through" value={ticket.received_via} />
              <Info label="Warranty" value={ticket.warranty_status} />
              <Info label="Support Location" value={ticket.support_mode} />
              <Info label="Support Type" value={ticket.support_type} />
              <Info label="Priority" value={ticket.priority} />
              <Info label="Inquiry" value={ticket.inquiry_no} />
              <Info label="Project" value={ticket.project_no} />
              <Info label="Phase" value={`Phase ${ticket.current_phase}`} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">
              Problem Details
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Problem Description" value={ticket.complaint} />
              <Info label="Customer Comment" value={ticket.customer_comment} />
            </div>
          </section>

          {phase1Sections.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Additional Details
              </h3>
              <DynamicForm
                sections={phase1Sections}
                values={ticket.phase1_data || {}}
                onChange={() => {}}
                embedded
              />
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Phase 2 · Repair &amp; Assignment
              </h3>
              {ticket.current_phase === 1 && canAssign && !showAssign && (
                <PrimaryButton
                  type="button"
                  onClick={() => setShowAssign(true)}
                >
                  Assign Phase 2
                </PrimaryButton>
              )}
            </div>

            {ticket.current_phase === 2 && !showAssign && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="Repairing Done By" value={location} />
                  {isInHouseRepair(location) ? (
                    <>
                      <Info
                        label="Department"
                        value={ticket.assigned_department}
                      />
                      <Info label="Employee(s)" value={ticket.assigned_to} />
                    </>
                  ) : (
                    <>
                      <Info label="Company Name" value={details.company_name} />
                      <Info
                        label="Contact Number"
                        value={details.contact_number}
                      />
                      <Info
                        label="Payment Amount"
                        value={
                          details.payment_amount != null
                            ? `Rs. ${details.payment_amount}`
                            : ""
                        }
                      />
                    </>
                  )}
                </div>
                {phase2Sections.length > 0 && (
                  <DynamicForm
                    sections={phase2Sections}
                    values={ticket.phase2_data || {}}
                    onChange={() => {}}
                    embedded
                  />
                )}
                {canAssign && (
                  <SecondaryButton
                    type="button"
                    onClick={() => setShowAssign(true)}
                  >
                    Re-assign
                  </SecondaryButton>
                )}
              </div>
            )}

            {showAssign && (
              <div className="space-y-4">
                <RepairDetailsFields
                  value={repair}
                  onChange={setRepair}
                  repairOptions={coreOptions.REPAIR_LOCATION || []}
                  departments={data.departments || []}
                  users={data.users || []}
                />
                {phase2Sections.length > 0 && (
                  <DynamicForm
                    sections={phase2Sections}
                    values={phase2Data}
                    onChange={setPhase2Data}
                    embedded
                  />
                )}
                <div className="flex justify-end gap-2">
                  <SecondaryButton
                    type="button"
                    onClick={() => setShowAssign(false)}
                    disabled={saving}
                  >
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton
                    type="button"
                    onClick={submitPhase2}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save Phase 2"}
                  </PrimaryButton>
                </div>
              </div>
            )}

            {ticket.current_phase === 1 && !canAssign && !showAssign && (
              <p className="text-xs text-slate-400">
                Not yet assigned for Phase 2.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">
              Record Information
            </h3>
            <div className="space-y-2">
              <Info label="Created By" value={ticket.created_by} />
              <Info
                label="Created Department"
                value={ticket.created_department}
              />
              <Info
                label="Created At"
                value={
                  ticket.created_at
                    ? new Date(ticket.created_at).toLocaleString()
                    : ""
                }
              />
              {ticket.rma_no && (
                <Info label="RMA Number" value={ticket.rma_no} />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Paperclip size={14} /> Photos &amp; Documents
            </h3>
            {(ticket.documents || []).length === 0 ? (
              <p className="text-xs text-slate-400">No documents uploaded.</p>
            ) : (
              <div className="space-y-2">
                {ticket.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
                  >
                    {doc.document_role === "PHOTO" ? (
                      <ImageIcon size={14} className="text-slate-400" />
                    ) : (
                      <FileText size={14} className="text-slate-400" />
                    )}
                    <span className="flex-1 truncate">{doc.file_name}</span>
                    <span className="text-slate-400">
                      {humanSize(doc.file_size)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

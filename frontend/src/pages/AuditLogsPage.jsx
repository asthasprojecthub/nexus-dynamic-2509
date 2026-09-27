import React, { useEffect, useMemo, useState } from "react";
import { History, RefreshCcw, Search, X } from "lucide-react";
import { api } from "../api";
import {
  matchesSearch,
  PageHeader,
  Table,
  Status,
  Select,
  SecondaryButton,
} from "../components/ui";

const INLINE_CHANGE_LIMIT = 3;

const niceKey = (key) =>
  String(key || "")
    .replace(/_/g, " ")
    .replace(/\./g, " › ")
    .replace(/\b(\d+)\b/g, (_, index) => String(Number(index) + 1))
    .replace(/\b\w/g, (char) => char.toUpperCase());

const HIDDEN_CHANGE_KEYS = new Set([
  "id",
  "field_key",
  "fieldkey",
  "is_active",
  "order",
  "display_order",
  "created_at",
  "updated_at",
  "created_by_id",
  "active_replacement_id",
  "status_history_id",
  "kickoff_meeting_id",
  "document_ids",
]);

const HIDDEN_LABEL_WRAPPERS = new Set([
  "ui_data",
  "general_data",
  "project_data",
  "panel_data",
  "ticket_data",
  "phase1_data",
  "phase2_data",
  "response_data",
]);

const isIdentifier = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

const visibleChangeLabel = (key, fieldLabels = {}) => {
  const parts = String(key || "").split(".").filter(Boolean);
  const visible = [];

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (fieldLabels[part]) {
      visible.push(fieldLabels[part]);
      continue;
    }
    if (HIDDEN_LABEL_WRAPPERS.has(normalized)) continue;
    if (HIDDEN_CHANGE_KEYS.has(normalized)) return "";
    if (normalized.endsWith("_id") || normalized.endsWith("_ids")) return "";
    if (isIdentifier(part) || /^f-[a-z0-9-]+$/i.test(part)) return "";
    visible.push(/^\d+$/.test(part) ? String(Number(part) + 1) : niceKey(part));
  }

  return visible.join(" › ");
};

const ist = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
};

const scalar = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    if (
      value.every((item) =>
        ["string", "number", "boolean"].includes(typeof item),
      )
    )
      return value.join(", ");
    return JSON.stringify(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const flatten = (value, prefix = "", output = {}) => {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      if (prefix) output[prefix] = value;
      return output;
    }
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, output));
    return output;
  }
  if (typeof value !== "object") {
    if (prefix) output[prefix] = value;
    return output;
  }
  Object.entries(value).forEach(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object") flatten(item, path, output);
    else output[path] = item;
  });
  return output;
};

const getChanges = (log) => {
  const before = flatten(log?.old_values);
  const after = flatten(log?.new_values);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map((key) => {
      const label = visibleChangeLabel(key, log?.field_labels || {});
      return {
        key,
        label,
        oldValue: scalar(before[key]),
        newValue: scalar(after[key]),
      };
    })
    .filter((change) =>
      change.label &&
      change.oldValue !== change.newValue &&
      !isIdentifier(change.oldValue) &&
      !isIdentifier(change.newValue),
    );
};

const actionCode = (log) => String(log?.action || "").toUpperCase();
const isCreatedAction = (log) =>
  actionCode(log) === "CREATE" || actionCode(log).endsWith("_CREATE");
const isLoginAction = (log) => actionCode(log) === "LOGIN";

function ChangeRows({ changes, compact = false }) {
  if (!changes.length)
    return (
      <span className="text-xs text-slate-400">No field changes recorded</span>
    );
  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {changes.map((change) => (
        <p
          key={change.key}
          className={`break-words leading-5 text-slate-700 ${compact ? "text-[11px]" : "rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"}`}
        >
          <span className="font-semibold text-slate-800">
            {change.label}:{" "}
          </span>
          <span className="font-medium text-rose-700">
            {change.oldValue}
          </span>
          <span className="px-1.5 font-semibold text-slate-400">→</span>
          <span className="font-semibold text-emerald-700">
            {change.newValue}
          </span>
        </p>
      ))}
    </div>
  );
}

function ChangesModal({ log, onClose }) {
  if (!log) return null;
  const changes = getChanges(log);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <History size={18} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">
                All Changes ({changes.length})
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {log.module} · {log.action_label || log.action} ·{" "}
              {log.record_label || "Record"} · {log.user} ·{" "}
              {ist(log.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4 sm:p-5">
          <ChangeRows changes={changes} />
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [q, setQ] = useState("");
  const [module, setModule] = useState("All");
  const [userId, setUserId] = useState("");
  const [department, setDepartment] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [options, setOptions] = useState({
    users: [],
    departments: [],
    events: [],
  });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: "200",
        offset: String(offset),
      });
      if (module !== "All") params.set("module", module);
      if (userId) params.set("user_id", userId);
      if (department) params.set("department", department);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      setLogs(await api(`/audit-logs?${params}`));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api("/audit-logs/options")
      .then(setOptions)
      .catch((loadError) => setError(loadError.message));
  }, []);
  useEffect(() => {
    load();
  }, [module, userId, department, action, from, to, offset]);

  const modules = useMemo(
    () => ["All", ...new Set(options.events.map((item) => item.module).filter(Boolean))],
    [options],
  );
  const rows = useMemo(
    () =>
      logs.filter((item) =>
        matchesSearch(
          [
            item.created_at,
            item.user,
            item.module,
            item.action_label || item.action,
            item.record_label,
            JSON.stringify(item.old_values || {}),
            JSON.stringify(item.new_values || {}),
          ],
          q,
        ),
      ),
    [logs, q],
  );

  return (
    <div className="fade-in">
      <PageHeader
        title="System Audit Logs"
        description="View created records, updates, user activity and login events."
        action={
          <SecondaryButton type="button" onClick={load} disabled={loading}>
            <RefreshCcw size={15} />
            {loading ? "Loading..." : "Refresh"}
          </SecondaryButton>
        }
      />
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search visible records"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm"
          />
          <button
            type="button"
            disabled={!q}
            onClick={() => setQ("")}
            title="Clear search"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-35"
          >
            <X size={14} />
          </button>
        </div>
        <Select
          value={module}
          onChange={(event) => {
            setModule(event.target.value);
            setOffset(0);
          }}
        >
          {modules.map((item) => (
            <option key={item} value={item}>
              {item === "All" ? "All modules" : niceKey(item)}
            </option>
          ))}
        </Select>
        <Select
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">All users</option>
          {options.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
        <Select
          value={department}
          onChange={(event) => {
            setDepartment(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">All departments</option>
          {options.departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">All actions</option>
          {[...new Set(options.events.map((event) => event.action))]
            .sort()
            .map((name) => (
              <option key={name} value={name}>
                {name.replaceAll("_", " ")}
              </option>
            ))}
        </Select>
        <label className="text-xs text-slate-600">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <SecondaryButton
            type="button"
            className="w-full"
            onClick={() => {
              setQ("");
              setModule("All");
              setUserId("");
              setDepartment("");
              setAction("");
              setFrom("");
              setTo("");
              setOffset(0);
            }}
          >
            Clear Filters
          </SecondaryButton>
        </div>
      </div>
      <Table
        rows={rows}
        onRowClick={(row) => setSelected(row)}
        empty={loading ? "Loading audit logs..." : "No audit records found"}
        columns={[
          {
            key: "created_at",
            label: "Date & Time (Server)",
            render: (value) => (
              <span className="whitespace-nowrap text-xs font-medium text-slate-600">
                {ist(value)}
              </span>
            ),
          },
          {
            key: "user",
            label: "User",
            render: (value) => (
              <span className="font-medium text-slate-900">{value}</span>
            ),
          },
          {
            key: "action",
            label: "Action",
            render: (_, row) => (
              <Status value={row.action_label || row.action} />
            ),
          },
          {
            key: "record_label",
            label: "Record",
            render: (value, row) => (
              <div>
                <div className="font-semibold text-slate-900">
                  {value || "Record"}
                </div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {niceKey(row.module)}
                </div>
              </div>
            ),
          },
          {
            key: "new_values",
            label: "What Changed",
            render: (_, row) => {
              if (isCreatedAction(row)) {
                return (
                  <span className="text-xs font-semibold text-emerald-700">
                    Created
                  </span>
                );
              }
              if (isLoginAction(row)) {
                return (
                  <span className="text-xs font-semibold text-blue-700">
                    Logged in successfully
                  </span>
                );
              }
              const changes = getChanges(row);
              const visible = changes.slice(0, INLINE_CHANGE_LIMIT);
              return (
                <div className="min-w-[360px] max-w-[760px] py-0.5">
                  <ChangeRows changes={visible} compact />
                </div>
              );
            },
          },
        ]}
      />
      <div className="mt-3 flex items-center justify-end gap-3 text-xs text-slate-600">
        <SecondaryButton
          type="button"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 200))}
        >
          Previous
        </SecondaryButton>
        <SecondaryButton
          type="button"
          disabled={logs.length < 200 || loading}
          onClick={() => setOffset(offset + 200)}
        >
          Next
        </SecondaryButton>
      </div>
      {selected && (
        <ChangesModal log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

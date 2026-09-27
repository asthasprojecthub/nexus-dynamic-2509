import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { api } from "../api";
import UserAccessEditor, {
  buildSuggestedPermissionKeys,
} from "../components/UserAccessEditor";
import {
  Field,
  Input,
  PrimaryButton,
  SecondaryButton,
  Select,
  Status,
  Toggle,
} from "../components/ui";
import { DetailHeader, Info } from "../components/RecordUI";

const emptyAccess = {
  roles: [],
  pages: [],
  assignments: {},
  role_defaults: {},
  users: [],
};

export default function UserDetailPage({ editable = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useStore();
  const record = useMemo(
    () => (data.users || []).find((item) => item.id === id),
    [data.users, id],
  );
  const [form, setForm] = useState(null);
  const [access, setAccess] = useState(emptyAccess);
  const [permissionKeys, setPermissionKeys] = useState([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const departments = (data.departments || []).filter(
    (d) => d.is_active !== false,
  );

  useEffect(() => {
    if (!record) return;
    setForm({
      full_name: record.full_name || "",
      email: record.email || "",
      role_id: "",
      departments: [...(record.departments || [])],
      is_active: record.is_active !== false,
    });
  }, [record]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingAccess(true);
      try {
        const model = await api("/access-control");
        if (!active) return;
        setAccess(model);
        const accessUser = model.users.find((user) => user.id === id);
        if (accessUser) {
          setForm((current) =>
            current
              ? { ...current, role_id: accessUser.role_id || "" }
              : current,
          );
          setPermissionKeys(model.assignments?.[id] || []);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoadingAccess(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (!record || !form)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading user...
      </div>
    );

  const selectedRole = access.roles.find((role) => role.id === form.role_id);
  const roleCode = String(selectedRole?.role_code || "").toUpperCase();
  const isAdmin = roleCode === "ADMIN";
  const singleDepartmentRole = ["TL", "EMPLOYEE"].includes(roleCode);
  const toggleDept = (name) => {
    const nextDepartments = isAdmin
      ? []
      : singleDepartmentRole
        ? [name]
        : form.departments.includes(name)
          ? form.departments.filter((item) => item !== name)
          : [...form.departments, name];
    setForm((current) => ({ ...current, departments: nextDepartments }));
    setPermissionKeys(
      buildSuggestedPermissionKeys(access.pages, roleCode, nextDepartments),
    );
  };
  const togglePermission = (key) =>
    setPermissionKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  const applyRoleDefaults = () =>
    setPermissionKeys(
      buildSuggestedPermissionKeys(access.pages, roleCode, form.departments),
    );
  const changeRole = (roleId) => {
    const role = access.roles.find((item) => item.id === roleId);
    const code = String(role?.role_code || "").toUpperCase();
    const nextDepartments =
      code === "ADMIN"
        ? []
        : ["TL", "EMPLOYEE"].includes(code)
          ? form.departments.slice(0, 1)
          : form.departments;
    setForm((p) => ({ ...p, role_id: roleId, departments: nextDepartments }));
    setPermissionKeys(
      buildSuggestedPermissionKeys(access.pages, code, nextDepartments),
    );
  };

  const save = async (e) => {
    e.preventDefault();
    if (!selectedRole) return setError("Choose a valid role.");
    if (singleDepartmentRole && form.departments.length !== 1)
      return setError(
        `${selectedRole.role_name} must have exactly one department.`,
      );
    if (roleCode === "HOD" && form.departments.length < 1)
      return setError("HOD must have at least one department.");
    setSaving(true);
    setError("");
    try {
      await api(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role_id: selectedRole.id,
          role: selectedRole.role_name,
          role_code: selectedRole.role_code,
          departments: form.departments,
          is_active: form.is_active,
        }),
      });
      await api(`/access-control/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          role_id: selectedRole.id,
          permission_keys: permissionKeys,
          is_active: form.is_active,
        }),
      });
      await refresh();
      navigate("/masters/users");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    const accessUser = access.users.find((user) => user.id === id);
    const effectiveKeys = access.assignments?.[id] || [];
    return (
      <div className="fade-in mx-auto max-w-6xl">
        <DetailHeader
          title={record.full_name}
          subtitle="User Management · Role, departments and individual access"
          onBack={() => navigate("/masters/users")}
          onEdit={() => navigate(`/masters/users/${id}/edit`)}
        />
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Info label="Full Name" value={record.full_name} />
          <Info label="Email" value={record.email} />
          <Info label="Role" value={accessUser?.role_name || record.role} />
          <Info
            label="Status"
            value={<Status value={record.is_active ? "Active" : "Inactive"} />}
          />
          <Info
            label="API Permissions"
            value={
              loadingAccess ? "Loading…" : `${effectiveKeys.length} allowed`
            }
          />
        </div>
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold">Departments</h3>
          <div className="flex flex-wrap gap-2">
            {record.departments?.length ? (
              record.departments.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
                >
                  {name}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">All / Admin</span>
            )}
          </div>
        </section>
        <div className="pointer-events-none opacity-90">
          <UserAccessEditor
            pages={access.pages}
            permissionKeys={effectiveKeys}
            onToggle={() => {}}
            onUseRoleDefaults={() => {}}
            isAdmin={accessUser?.role_code === "ADMIN"}
            loading
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-6xl">
      <DetailHeader
        title={`Edit ${record.full_name}`}
        subtitle="User Management · Edit user and person-specific access"
        editing
        onBack={() => navigate("/masters/users")}
      />
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <form
        onSubmit={save}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full Name" required>
            <Input
              required
              value={form.full_name}
              onChange={(e) =>
                setForm((p) => ({ ...p, full_name: e.target.value }))
              }
            />
          </Field>
          <Field label="Email" required>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
            />
          </Field>
          <Field label="Designation / Role" required>
            <Select
              required
              value={form.role_id}
              onChange={(e) => changeRole(e.target.value)}
              disabled={loadingAccess}
            >
              <option value="">Select role</option>
              {access.roles
                .filter((role) => role.is_active !== false)
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.role_name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Department / Team
          </p>
          <p className="mb-2 text-[11px] text-slate-400">
            TL and Employee can have exactly one department. HOD can have
            multiple departments. Admin is organization-wide.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {departments.map((d) => {
              const selected = form.departments.includes(d.department_name);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDept(d.department_name)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${selected ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {d.department_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <div>
            <p className="text-sm font-medium">User Status</p>
            <p className="text-xs text-slate-400">
              Inactive users cannot sign in or be used normally.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Status value={form.is_active ? "Active" : "Inactive"} />
            <Toggle
              checked={form.is_active}
              onChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
          </div>
        </div>

        <UserAccessEditor
          pages={access.pages}
          permissionKeys={permissionKeys}
          onToggle={togglePermission}
          onUseRoleDefaults={applyRoleDefaults}
          isAdmin={isAdmin}
          loading={loadingAccess}
        />

        <div className="mt-4 flex justify-end gap-2">
          <SecondaryButton
            type="button"
            onClick={() => navigate("/masters/users")}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving || loadingAccess}>
            {saving ? "Saving..." : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

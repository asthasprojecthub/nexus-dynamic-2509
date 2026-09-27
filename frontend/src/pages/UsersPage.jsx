import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { api } from "../api";
import UserAccessEditor, {
  buildSuggestedPermissionKeys,
} from "../components/UserAccessEditor";
import {
  Field,
  Input,
  matchesSearch,
  Modal,
  PageHeader,
  PrimaryButton,
  SearchBox,
  SecondaryButton,
  Select,
  Status,
  Table,
  Toggle,
} from "../components/ui";
import { RowActions } from "../components/RecordUI";

const emptyForm = () => ({
  full_name: "",
  email: "",
  password: "",
  role_id: "",
  departments: [],
  is_active: true,
});

export default function UsersPage({ createMode = false }) {
  const { data, refresh } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [access, setAccess] = useState({
    roles: [],
    pages: [],
    role_defaults: {},
  });
  const [permissionKeys, setPermissionKeys] = useState([]);
  const [loadingAccess, setLoadingAccess] = useState(createMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const rows = useMemo(
    () =>
      (data.users || []).filter((item) =>
        matchesSearch([item.full_name, item.email, item.role, item.departments], q),
      ),
    [data.users, q],
  );
  const activeDepartments = (data.departments || []).filter(
    (item) => item.is_active !== false,
  );
  const selectedRole = access.roles.find((role) => role.id === form.role_id);
  const roleCode = String(selectedRole?.role_code || "").toUpperCase();
  const isAdmin = roleCode === "ADMIN";
  const singleDepartmentRole = ["TL", "EMPLOYEE"].includes(roleCode);
  const currentUserIsAdmin =
    String(data.currentUser?.role_code || data.currentUser?.role || "").toUpperCase() === "ADMIN";

  const openPasswordReset = (user) => {
    setPasswordTarget(user);
    setPasswordForm({ new_password: "", confirm_password: "" });
    setPasswordError("");
  };

  const resetUserPassword = async (event) => {
    event.preventDefault();
    if (!passwordTarget || resettingPassword) return;
    if (passwordForm.new_password.length < 8)
      return setPasswordError("New password must contain at least 8 characters.");
    if (passwordForm.new_password !== passwordForm.confirm_password)
      return setPasswordError("New password and confirmation do not match.");
    setResettingPassword(true);
    setPasswordError("");
    try {
      await api(`/users/${passwordTarget.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: passwordForm.new_password }),
      });
      setPasswordTarget(null);
      setPasswordForm({ new_password: "", confirm_password: "" });
    } catch (resetError) {
      setPasswordError(resetError.message);
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    if (!createMode) return;
    let active = true;
    (async () => {
      setLoadingAccess(true);
      try {
        const model = await api("/access-control");
        if (!active) return;
        setAccess(model);
        const defaultRole =
          model.roles.find(
            (role) => role.role_code === "EMPLOYEE" && role.is_active !== false,
          ) || model.roles.find((role) => role.is_active !== false);
        if (defaultRole) {
          setForm((current) => ({ ...current, role_id: defaultRole.id }));
          setPermissionKeys(
            buildSuggestedPermissionKeys(
              model.pages,
              defaultRole.role_code,
              [],
            ),
          );
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
  }, [createMode]);

  const toggleDepartment = (name) => {
    const nextDepartments = isAdmin
      ? []
      : singleDepartmentRole
        ? [name]
        : form.departments.includes(name)
          ? form.departments.filter((item) => item !== name)
          : [...form.departments, name];
    setForm((prev) => ({ ...prev, departments: nextDepartments }));
    // On Add User, department selection is part of the suggested-access rule.
    // Rebuild immediately so Employee + Sales does not keep the generic
    // no-department defaults that were calculated when the role first loaded.
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
    setForm((prev) => ({
      ...prev,
      role_id: roleId,
      departments: nextDepartments,
    }));
    setPermissionKeys(
      buildSuggestedPermissionKeys(access.pages, code, nextDepartments),
    );
  };

  const submit = async (event) => {
    event.preventDefault();
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
      const created = await api("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          role_id: selectedRole.id,
          role: selectedRole.role_name,
          role_code: selectedRole.role_code,
          departments: form.departments,
          is_active: form.is_active,
        }),
      });
      await api(`/access-control/users/${created.id}`, {
        method: "PUT",
        body: JSON.stringify({
          role_id: selectedRole.id,
          permission_keys: permissionKeys,
          is_active: form.is_active,
        }),
      });
      await refresh();
      navigate("/masters/users");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (createMode)
    return (
      <div className="fade-in mx-auto max-w-6xl">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/masters/users")}
            className="mt-0.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="mt-1">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Add New User
            </h1>
            <p className="text-sm text-slate-500">
              Create the person, assign role and departments, then configure
              that person’s page access in the same form.
            </p>
          </div>
        </div>
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <form
          onSubmit={submit}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full Name" required>
              <Input
                required
                value={form.full_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
              />
            </Field>
            <Field label="Email" required>
              <Input
                required
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </Field>
            <Field label="Password" required>
              <Input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
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
            <div className="sm:col-span-1 lg:col-span-2 flex items-end">
              <div className="flex w-full min-h-10 items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    User Status
                  </p>
                  <p className="text-xs text-slate-400">
                    Inactive users cannot sign in or be used normally.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Status value={form.is_active ? "Active" : "Inactive"} />
                  <Toggle
                    checked={form.is_active}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, is_active: value }))
                    }
                  />
                </div>
              </div>
            </div>
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
              {activeDepartments.map((department) => {
                const selected = form.departments.includes(
                  department.department_name,
                );
                return (
                  <button
                    key={department.id}
                    type="button"
                    onClick={() => toggleDepartment(department.department_name)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${selected ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {department.department_name}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Admin may remain without a department for organization-wide
              access.
            </p>
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
              {saving ? "Creating..." : "Create User"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );

  return (
    <div className="fade-in">
      <PageHeader
        title="User Management"
        description="Manage users, department membership, role and person-specific page permissions from one place."
        action={
          <PrimaryButton onClick={() => navigate("/masters/users/new")}>
            <Plus size={16} /> Add User
          </PrimaryButton>
        }
      />
      <div className="mb-3">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search name, email, role..."
        />
      </div>
      <Table
        rows={rows}
        onRowClick={(row) => navigate(`/masters/users/${row.id}/view`)}
        columns={[
          {
            key: "full_name",
            label: "User",
            render: (value, row) => (
              <div>
                <p className="font-medium text-slate-900">{value}</p>
                <p className="text-xs text-slate-400">{row.email}</p>
              </div>
            ),
          },
          {
            key: "role",
            label: "Role",
            render: (value) => (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {value}
              </span>
            ),
          },
          {
            key: "departments",
            label: "Departments",
            render: (value = []) =>
              value.length ? (
                <div className="flex flex-wrap gap-1">
                  {value.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400">All / Admin</span>
              ),
          },
          {
            key: "is_active",
            label: "Status",
            render: (value) => <Status value={value ? "Active" : "Inactive"} />,
          },
          {
            key: "id",
            label: "Actions",
            render: (_, row) => (
              <div className="flex items-center justify-end gap-1">
                <RowActions
                  onView={() => navigate(`/masters/users/${row.id}/view`)}
                  onEdit={() => navigate(`/masters/users/${row.id}/edit`)}
                />
                {currentUserIsAdmin && (
                  <button
                    type="button"
                    onClick={() => openPasswordReset(row)}
                    title={`Change password for ${row.full_name}`}
                    aria-label={`Change password for ${row.full_name}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-700"
                  >
                    <KeyRound size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      {passwordTarget && currentUserIsAdmin && (
        <Modal
          title={`Change Password · ${passwordTarget.full_name}`}
          onClose={() => setPasswordTarget(null)}
        >
          <form onSubmit={resetUserPassword}>
            <p className="mb-4 text-sm text-slate-500">
              Set a new password directly. The user’s old password is not required.
            </p>
            {passwordError && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {passwordError}
              </div>
            )}
            <div className="space-y-3">
              <Field label="New Password" required>
                <Input
                  required
                  autoFocus
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={passwordForm.new_password}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      new_password: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Confirm New Password" required>
                <Input
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={passwordForm.confirm_password}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirm_password: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton
                type="button"
                onClick={() => setPasswordTarget(null)}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={resettingPassword}>
                <KeyRound size={15} />
                {resettingPassword ? "Changing..." : "Change Password"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

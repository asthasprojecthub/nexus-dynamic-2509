import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderKanban,
  ListChecks,
  Menu,
  PanelsTopLeft,
  Clock3,
  Search,
  UsersRound,
  Workflow,
  ScrollText,
  Files,
  LogOut,
  KeyRound,
  LifeBuoy,
  Mail,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import logoFull from "../assets/nexus-logo-full.png";
import logoX from "../assets/nexus-logo-x.png";
import { useStore } from "../store";
import PageUXEnhancer from "./PageUXEnhancer";
import ChangePassword from "./ChangePassword";
import EditProfile from "./EditProfile";

const main = [
  ["/inquiries", FileText, "Inquiries", "INQUIRIES.VIEW"],
  ["/projects", FolderKanban, "Projects", "PROJECTS.VIEW"],
  ["/customers", Building2, "Customers", "CUSTOMERS.VIEW"],
  ["/timesheet", Clock3, "Timesheet", "TIMESHEET.VIEW"],
  ["/tickets", LifeBuoy, "Tickets", "TICKETS.VIEW"],
];

const masters = [
  ["/masters/inquiry", ClipboardList, "Inquiry Master", "INQUIRY_MASTER.VIEW"],
  ["/masters/panels", PanelsTopLeft, "Panel Master", "PANEL_MASTER.VIEW"],
  ["/masters/project", FolderKanban, "Project Master", "PROJECT_MASTER.VIEW"],
  [
    "/masters/planning-grid",
    ListChecks,
    "Planning Grid Master",
    "PLANNING_GRID_MASTER.VIEW",
  ],
  ["/masters/departments", Workflow, "Department Master", "DEPARTMENTS.VIEW"],
  ["/masters/users", UsersRound, "User Management", "USERS.VIEW"],
  ["/masters/timesheet", Clock3, "Timesheet Master", "TIMESHEET_MASTER.VIEW"],
  [
    "/masters/document-types",
    Files,
    "Document Type Master",
    "DOCUMENT_TYPES.VIEW",
  ],
  ["/masters/tickets", LifeBuoy, "Ticket Master", "TICKET_MASTER.VIEW"],
  ["/masters/audit-logs", ScrollText, "Audit Logs", "AUDIT_LOGS.VIEW"],
];

const LinkItem = ({ to, icon: Icon, label, collapsed, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`
    }
  >
    <Icon size={18} className="shrink-0" />
    <span className={`${collapsed ? "lg:hidden" : ""} truncate`}>{label}</span>
  </NavLink>
);

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");
  const location = useLocation();
  useEffect(() => setProfileOpen(false), [location.pathname]);
  const navigate = useNavigate();
  const { data, refresh } = useStore();
  const currentUser = data.currentUser;
  const permissions = new Set(currentUser?.permissions || []);
  const visible = (items) =>
    !currentUser
      ? []
      : items.filter(
          ([, , , permission]) => !permission || permissions.has(permission),
        );
  const visibleMain = visible(main);
  const visibleMasters = visible(masters);
  const moduleResults = [...visibleMain, ...visibleMasters].filter(([, , label]) =>
    label.toLowerCase().includes(moduleQuery.trim().toLowerCase()),
  );
  const unreadNotifications = (data.notifications || []).filter(
    (item) => !item.is_read,
  ).length;
  const allLinks = [...main, ...masters];
  const pathLabel = location.pathname.startsWith("/notifications")
    ? "Notifications"
    : allLinks.find(([to]) => location.pathname.startsWith(to))?.[2] ||
      "Nexus Management";
  const initials = (currentUser?.full_name || "Nexus User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleName =
    { ADMIN: "Admin", HOD: "HOD", TL: "Team Lead", EMPLOYEE: "Employee" }[
      currentUser?.role_code
    ] ||
    currentUser?.role ||
    "User";
  const departmentNames =
    (currentUser?.departments || []).join(", ") ||
    (currentUser?.role_code === "ADMIN"
      ? "All departments"
      : "No department assigned");
  const isAdmin = currentUser?.role_code === "ADMIN";
  const canViewNotifications = permissions.has("NOTIFICATIONS.VIEW");
  const logout = () => {
    localStorage.removeItem("nexus_token");
    localStorage.removeItem("nexus_user");
    navigate("/login", { replace: true });
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      {mobile && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-white transition-all duration-300 ${collapsed ? "lg:w-16" : "lg:w-60"} w-60 ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className={`flex h-16 items-center border-b border-slate-700 px-3 ${collapsed ? "lg:justify-center" : "justify-start"}`}
        >
          <img
            src={collapsed ? logoX : logoFull}
            className={`${collapsed ? "h-9 w-9" : "h-10 max-w-[165px]"} object-contain`}
            alt="Nexus"
          />
        </div>
        <nav className="flex-1 overflow-y-auto p-2.5">
          <p
            className={`${collapsed ? "lg:hidden" : ""} mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500`}
          >
            Workspace
          </p>
          <div className="space-y-1">
            {visibleMain.map(([to, icon, label]) => (
              <LinkItem
                key={to}
                to={to}
                icon={icon}
                label={label}
                collapsed={collapsed}
                onClick={() => setMobile(false)}
              />
            ))}
          </div>
          <p
            className={`${collapsed ? "lg:hidden" : ""} mb-1.5 mt-5 px-3 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500`}
          >
            Master & Control
          </p>
          <div className="space-y-1">
            {visibleMasters.map(([to, icon, label]) => (
              <LinkItem
                key={to}
                to={to}
                icon={icon}
                label={label}
                collapsed={collapsed}
                onClick={() => setMobile(false)}
              />
            ))}
          </div>
        </nav>
        <div className="border-t border-slate-700 p-2.5">
          <div
            className={`flex items-center gap-3 rounded-xl bg-slate-800/70 p-2.5 ${collapsed ? "lg:justify-center lg:p-2" : ""}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">
              {initials || "NU"}
            </div>
            <div className={`${collapsed ? "lg:hidden" : ""} min-w-0 flex-1`}>
              <p className="truncate text-sm font-semibold">
                {currentUser?.full_name || "Nexus User"}
              </p>
              <p className="truncate text-[11px] text-slate-300">{roleName}</p>
              <p
                className="truncate text-[10px] text-slate-400"
                title={departmentNames}
              >
                {departmentNames}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className={`${collapsed ? "lg:hidden" : ""} rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white`}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-[82px] hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow lg:flex"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      <div
        className={`flex h-screen min-w-0 flex-col transition-all duration-300 ${collapsed ? "lg:ml-16" : "lg:ml-60"}`}
      >
        <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {pathLabel}
              </p>
              <p className="hidden text-[11px] text-slate-400 sm:block">
                Nexus Management System
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <div className="relative hidden md:block">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <Search size={14} className="shrink-0 text-slate-400" />
                <input
                  value={moduleQuery}
                  onChange={(event) => setModuleQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && moduleResults[0]) {
                      navigate(moduleResults[0][0]);
                      setModuleQuery('');
                    }
                  }}
                  placeholder="Search module..."
                  className="w-32 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                />
                <button type="button" disabled={!moduleQuery} onClick={() => setModuleQuery('')} aria-label="Clear module search" title="Clear search" className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-default disabled:opacity-35"><X size={13} /></button>
              </div>
              {moduleQuery && <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                {moduleResults.length ? moduleResults.map(([to, Icon, label]) => <button key={to} type="button" onClick={() => { navigate(to); setModuleQuery(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Icon size={15} />{label}</button>) : <p className="px-3 py-3 text-xs text-slate-400">No matching module.</p>}
              </div>}
            </div>
            {canViewNotifications && <button
              onClick={() => navigate("/notifications")}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              title="Notifications"
            >
              <Bell size={18} />
              {unreadNotifications > 0 && (
                <>
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
                  {unreadNotifications > 1 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
                      {Math.min(unreadNotifications, 99)}
                    </span>
                  )}
                </>
              )}
            </button>}
            <button
              type="button"
              aria-label="My account"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {initials || "NU"}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-xl">
                <div className="flex items-center gap-3 bg-blue-600 px-4 py-4 text-white">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold ring-1 ring-white/30">
                    {initials || "NU"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {currentUser?.full_name || "Nexus User"}
                    </p>
                    <p className="text-xs text-blue-100">{roleName}</p>
                  </div>
                </div>
                <div className="space-y-2 border-b border-slate-100 px-4 py-3 text-xs">
                  <div className="flex items-start gap-2 text-slate-600">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>{roleName} · {departmentNames}</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600">
                    <Mail size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="break-all">{currentUser?.email || ""}</span>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setEditProfileOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                  >
                    <Pencil size={15} className="text-slate-400" /> Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setPasswordOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                  >
                    <KeyRound size={15} className="text-slate-400" /> Change Password
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/masters/users");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                    >
                      <UsersRound size={15} className="text-slate-400" /> User Management
                    </button>
                  )}
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={15} /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 xl:p-5">
          <PageUXEnhancer />
          <Outlet />
        </main>
      </div>
      {passwordOpen && (
        <ChangePassword onClose={() => setPasswordOpen(false)} />
      )}
      {editProfileOpen && (
        <EditProfile
          user={currentUser}
          onClose={() => setEditProfileOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

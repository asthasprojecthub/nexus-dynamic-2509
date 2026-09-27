import React from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { StoreProvider, useStore } from "./store";
import PanelsPage from "./pages/PanelsPage";
import PanelMasterDetailPage from "./pages/PanelMasterDetailPage";
import InquiriesPage from "./pages/InquiriesPage";
import InquiryDetailPage from "./pages/InquiryDetailPage";
import InquiryMasterPage from "./pages/InquiryMasterPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ProjectMasterPage from "./pages/ProjectMasterPage";
import MasterVersionPage from "./pages/MasterVersionPage";
import PlanningGridMasterPage from "./pages/PlanningGridMasterPage";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import DepartmentDetailPage from "./pages/DepartmentDetailPage";
import UsersPage from "./pages/UsersPage";
import UserDetailPage from "./pages/UserDetailPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import DocumentTypesPage from "./pages/DocumentTypesPage";
import NotificationsPage from "./pages/NotificationsPage";
import TimesheetPage from "./pages/TimesheetPage";
import TimesheetMasterPage from "./pages/TimesheetMasterPage";
import ProjectActivityPage from "./pages/ProjectActivityPage";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import TicketMasterPage from "./pages/TicketMasterPage";

function RequireAuth() {
  return localStorage.getItem("nexus_token") ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
}

function RequirePermission({ permission }) {
  const { data, backendStatus } = useStore();
  if (backendStatus.loading) return null;
  return data.currentUser?.permissions?.includes(permission) ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  );
}

function PermissionHome() {
  const { data, backendStatus } = useStore();
  if (backendStatus.loading) return null;
  const permissions = new Set(data.currentUser?.permissions || []);
  const firstPage = [
    ["INQUIRIES.VIEW", "/inquiries"],
    ["PROJECTS.VIEW", "/projects"],
    ["CUSTOMERS.VIEW", "/customers"],
    ["TIMESHEET.VIEW", "/timesheet"],
    ["TICKETS.VIEW", "/tickets"],
    ["INQUIRY_MASTER.VIEW", "/masters/inquiry"],
    ["PANEL_MASTER.VIEW", "/masters/panels"],
    ["PROJECT_MASTER.VIEW", "/masters/project"],
    ["PLANNING_GRID_MASTER.VIEW", "/masters/planning-grid"],
    ["DEPARTMENTS.VIEW", "/masters/departments"],
    ["USERS.VIEW", "/masters/users"],
    ["TIMESHEET_MASTER.VIEW", "/masters/timesheet"],
    ["DOCUMENT_TYPES.VIEW", "/masters/document-types"],
    ["TICKET_MASTER.VIEW", "/masters/tickets"],
    ["AUDIT_LOGS.VIEW", "/masters/audit-logs"],
    ["NOTIFICATIONS.VIEW", "/notifications"],
  ].find(([permission]) => permissions.has(permission))?.[1];
  return firstPage ? (
    <Navigate to={firstPage} replace />
  ) : (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      No dashboard page has been assigned to this user.
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<PermissionHome />} />

            <Route element={<RequirePermission permission="INQUIRIES.VIEW" />}>
              <Route path="inquiries" element={<InquiriesPage />} />
              <Route path="inquiries/:id/view" element={<InquiryDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="INQUIRIES.CREATE" />}>
              <Route path="inquiries/new" element={<InquiriesPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="INQUIRIES.UPDATE" />}>
              <Route path="inquiries/:id/edit" element={<InquiryDetailPage editable />} />
            </Route>

            <Route element={<RequirePermission permission="PROJECTS.VIEW" />}>
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id/view" element={<ProjectDetailPage />} />
              <Route path="projects/:id/activity" element={<ProjectActivityPage />} />
            </Route>
            <Route element={<RequirePermission permission="PROJECTS.CREATE" />}>
              <Route path="projects/new" element={<ProjectsPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="PROJECTS.UPDATE" />}>
              <Route path="projects/:id/edit" element={<ProjectDetailPage editable />} />
            </Route>

            <Route element={<RequirePermission permission="TIMESHEET.VIEW" />}>
              <Route path="timesheet" element={<TimesheetPage />} />
            </Route>

            <Route element={<RequirePermission permission="TICKETS.VIEW" />}>
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="tickets/:id/view" element={<TicketDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="TICKETS.CREATE" />}>
              <Route path="tickets/new" element={<TicketDetailPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="TICKETS.UPDATE" />}>
              <Route path="tickets/:id/edit" element={<TicketDetailPage editable />} />
            </Route>

            <Route element={<RequirePermission permission="CUSTOMERS.VIEW" />}>
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id/view" element={<CustomerDetailPage />} />
              <Route path="masters/customers" element={<CustomersPage />} />
              <Route path="masters/customers/:id/view" element={<CustomerDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="CUSTOMERS.CREATE" />}>
              <Route path="customers/new" element={<CustomersPage createMode />} />
              <Route path="masters/customers/new" element={<CustomersPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="CUSTOMERS.UPDATE" />}>
              <Route path="customers/:id/edit" element={<CustomerDetailPage editable />} />
              <Route path="masters/customers/:id/edit" element={<CustomerDetailPage editable />} />
            </Route>

            {/* Backward-compatible aliases; customer is now a normal workspace page. */}
            <Route element={<RequirePermission permission="DEPARTMENTS.VIEW" />}>
              <Route path="masters/departments" element={<DepartmentsPage />} />
              <Route path="masters/departments/:id/view" element={<Navigate to="/masters/departments" replace />} />
            </Route>
            <Route element={<RequirePermission permission="DEPARTMENTS.CREATE" />}>
              <Route path="masters/departments/new" element={<DepartmentsPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="DEPARTMENTS.UPDATE" />}>
              <Route path="masters/departments/:id/edit" element={<DepartmentDetailPage />} />
            </Route>

            <Route element={<RequirePermission permission="USERS.VIEW" />}>
              <Route path="masters/users" element={<UsersPage />} />
              <Route path="masters/users/:id/view" element={<UserDetailPage />} />
              <Route path="masters/role-permissions" element={<Navigate to="/masters/users" replace />} />
            </Route>
            <Route element={<RequirePermission permission="USERS.CREATE" />}>
              <Route path="masters/users/new" element={<UsersPage createMode />} />
            </Route>
            <Route element={<RequirePermission permission="USERS.UPDATE" />}>
              <Route path="masters/users/:id/edit" element={<UserDetailPage editable />} />
            </Route>

            <Route element={<RequirePermission permission="AUDIT_LOGS.VIEW" />}>
              <Route path="masters/audit-logs" element={<AuditLogsPage />} />
            </Route>
            <Route element={<RequirePermission permission="TIMESHEET_MASTER.VIEW" />}>
              <Route path="masters/timesheet" element={<TimesheetMasterPage />} />
            </Route>
            <Route element={<RequirePermission permission="DOCUMENT_TYPES.VIEW" />}>
              <Route path="masters/document-types" element={<DocumentTypesPage />} />
            </Route>
            <Route element={<RequirePermission permission="TICKET_MASTER.VIEW" />}>
              <Route path="masters/tickets" element={<TicketMasterPage />} />
              <Route path="masters/tickets/versions/:id/view" element={<MasterVersionPage type="ticket" />} />
            </Route>
            <Route element={<RequirePermission permission="TICKET_MASTER.CREATE" />}>
              <Route path="masters/tickets/versions/new" element={<MasterVersionPage type="ticket" createMode />} />
            </Route>
            <Route element={<RequirePermission permission="TICKET_MASTER.UPDATE" />}>
              <Route path="masters/tickets/versions/:id/edit" element={<MasterVersionPage type="ticket" editable />} />
            </Route>
            <Route element={<RequirePermission permission="NOTIFICATIONS.VIEW" />}>
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route element={<RequirePermission permission="INQUIRY_MASTER.VIEW" />}>
              <Route path="masters/inquiry" element={<InquiryMasterPage />} />
              <Route path="masters/inquiry/:id/view" element={<MasterVersionPage type="inquiry" />} />
            </Route>
            <Route element={<RequirePermission permission="INQUIRY_MASTER.CREATE" />}>
              <Route path="masters/inquiry/new" element={<MasterVersionPage type="inquiry" createMode />} />
            </Route>
            <Route element={<RequirePermission permission="INQUIRY_MASTER.UPDATE" />}>
              <Route path="masters/inquiry/:id/edit" element={<MasterVersionPage type="inquiry" editable />} />
            </Route>

            <Route element={<RequirePermission permission="PANEL_MASTER.VIEW" />}>
              <Route path="masters/panels" element={<PanelsPage />} />
              <Route path="masters/panels/:id/view" element={<PanelMasterDetailPage />} />
              <Route path="masters/panels/:id/versions/:versionId/view" element={<MasterVersionPage type="panel" />} />
            </Route>
            <Route element={<RequirePermission permission="PANEL_MASTER.CREATE" />}>
              <Route path="masters/panels/new" element={<PanelsPage createMode />} />
              <Route path="masters/panels/:id/versions/new" element={<MasterVersionPage type="panel" createMode />} />
            </Route>
            <Route element={<RequirePermission permission="PANEL_MASTER.UPDATE" />}>
              <Route path="masters/panels/:id/edit" element={<PanelMasterDetailPage editable />} />
              <Route path="masters/panels/:id/versions/:versionId/edit" element={<MasterVersionPage type="panel" editable />} />
            </Route>

            <Route element={<RequirePermission permission="PROJECT_MASTER.VIEW" />}>
              <Route path="masters/project" element={<ProjectMasterPage />} />
              <Route path="masters/project/:id/view" element={<MasterVersionPage type="project" />} />
            </Route>
            <Route element={<RequirePermission permission="PROJECT_MASTER.CREATE" />}>
              <Route path="masters/project/new" element={<MasterVersionPage type="project" createMode />} />
            </Route>
            <Route element={<RequirePermission permission="PROJECT_MASTER.UPDATE" />}>
              <Route path="masters/project/:id/edit" element={<MasterVersionPage type="project" editable />} />
            </Route>

            <Route element={<RequirePermission permission="PLANNING_GRID_MASTER.VIEW" />}>
              <Route path="masters/planning-grid" element={<PlanningGridMasterPage />} />
              <Route path="masters/planning-grid/:id/view" element={<PlanningGridMasterPage mode="view" />} />
            </Route>
            <Route element={<RequirePermission permission="PLANNING_GRID_MASTER.CREATE" />}>
              <Route path="masters/planning-grid/new" element={<PlanningGridMasterPage mode="new" />} />
            </Route>
            <Route element={<RequirePermission permission="PLANNING_GRID_MASTER.UPDATE" />}>
              <Route path="masters/planning-grid/:id/edit" element={<PlanningGridMasterPage mode="edit" />} />
            </Route>

            <Route path="*" element={<PermissionHome />} />
          </Route>
        </Route>
      </Routes>
    </StoreProvider>
  );
}

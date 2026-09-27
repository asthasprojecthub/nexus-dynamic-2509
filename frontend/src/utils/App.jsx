import React from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { StoreProvider } from './store';
import PanelsPage from './pages/PanelsPage';
import PanelMasterDetailPage from './pages/PanelMasterDetailPage';
import InquiriesPage from './pages/InquiriesPage';
import InquiryDetailPage from './pages/InquiryDetailPage';
import InquiryMasterPage from './pages/InquiryMasterPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectMasterPage from './pages/ProjectMasterPage';
import MasterVersionPage from './pages/MasterVersionPage';
import PlanningGridMasterPage from './pages/PlanningGridMasterPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import DepartmentsPage from './pages/DepartmentsPage';
import DepartmentDetailPage from './pages/DepartmentDetailPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import AuditLogsPage from './pages/AuditLogsPage';
import DocumentTypesPage from './pages/DocumentTypesPage';
import NotificationsPage from './pages/NotificationsPage';
import TimesheetPage from './pages/TimesheetPage';
import TimesheetMasterPage from './pages/TimesheetMasterPage';
import ProjectActivityPage from './pages/ProjectActivityPage';
import LoginPage from './pages/LoginPage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import TicketMasterPage from './pages/TicketMasterPage';

function RequireAuth(){
  return localStorage.getItem('nexus_token') ? <Outlet/> : <Navigate to="/login" replace/>;
}

export default function App(){
  return (
    <StoreProvider>
      <Routes>
        <Route path="/login" element={<LoginPage/>}/>
        <Route element={<RequireAuth/>}>
          <Route element={<Layout/>}>
            <Route index element={<Navigate to="/inquiries" replace/>}/>

          <Route path="inquiries" element={<InquiriesPage/>}/>
          <Route path="inquiries/new" element={<InquiriesPage createMode/>}/>
          <Route path="inquiries/:id/view" element={<InquiryDetailPage/>}/>
          <Route path="inquiries/:id/edit" element={<InquiryDetailPage editable/>}/>

          <Route path="projects" element={<ProjectsPage/>}/>
          <Route path="projects/new" element={<ProjectsPage createMode/>}/>
          <Route path="projects/:id/view" element={<ProjectDetailPage/>}/>
          <Route path="projects/:id/edit" element={<ProjectDetailPage editable/>}/>
          <Route path="projects/:id/activity" element={<ProjectActivityPage/>}/>

          <Route path="timesheet" element={<TimesheetPage/>}/>

          <Route path="tickets" element={<TicketsPage/>}/>
          <Route path="tickets/new" element={<TicketDetailPage createMode/>}/>
          <Route path="tickets/:id/view" element={<TicketDetailPage/>}/>
          <Route path="tickets/:id/edit" element={<TicketDetailPage editable/>}/>

          <Route path="customers" element={<CustomersPage/>}/>
          <Route path="customers/new" element={<CustomersPage createMode/>}/>
          <Route path="customers/:id/view" element={<CustomerDetailPage/>}/>
          <Route path="customers/:id/edit" element={<CustomerDetailPage editable/>}/>

          {/* Backward-compatible aliases; customer is now a normal workspace page. */}
          <Route path="masters/customers" element={<CustomersPage/>}/>
          <Route path="masters/customers/new" element={<CustomersPage createMode/>}/>
          <Route path="masters/customers/:id/view" element={<CustomerDetailPage/>}/>
          <Route path="masters/customers/:id/edit" element={<CustomerDetailPage editable/>}/>

          <Route path="masters/departments" element={<DepartmentsPage/>}/>
          <Route path="masters/departments/new" element={<DepartmentsPage createMode/>}/>
          <Route path="masters/departments/:id/view" element={<Navigate to="/masters/departments" replace/>}/>
          <Route path="masters/departments/:id/edit" element={<DepartmentDetailPage/>}/>

          <Route path="masters/users" element={<UsersPage/>}/>
          <Route path="masters/users/new" element={<UsersPage createMode/>}/>
          <Route path="masters/users/:id/view" element={<UserDetailPage/>}/>
          <Route path="masters/users/:id/edit" element={<UserDetailPage editable/>}/>

          <Route path="masters/role-permissions" element={<Navigate to="/masters/users" replace/>}/>
          <Route path="masters/audit-logs" element={<AuditLogsPage/>}/>
          <Route path="masters/timesheet" element={<TimesheetMasterPage/>}/>
          <Route path="masters/document-types" element={<DocumentTypesPage/>}/>
          <Route path="masters/tickets" element={<TicketMasterPage/>}/>
          <Route path="notifications" element={<NotificationsPage/>}/>

          <Route path="masters/inquiry" element={<InquiryMasterPage/>}/>
          <Route path="masters/inquiry/new" element={<MasterVersionPage type="inquiry" createMode/>}/>
          <Route path="masters/inquiry/:id/view" element={<MasterVersionPage type="inquiry"/>}/>
          <Route path="masters/inquiry/:id/edit" element={<MasterVersionPage type="inquiry" editable/>}/>

          <Route path="masters/panels" element={<PanelsPage/>}/>
          <Route path="masters/panels/new" element={<PanelsPage createMode/>}/>
          <Route path="masters/panels/:id/view" element={<PanelMasterDetailPage/>}/>
          <Route path="masters/panels/:id/edit" element={<PanelMasterDetailPage editable/>}/>
          <Route path="masters/panels/:id/versions/new" element={<MasterVersionPage type="panel" createMode/>}/>
          <Route path="masters/panels/:id/versions/:versionId/view" element={<MasterVersionPage type="panel"/>}/>
          <Route path="masters/panels/:id/versions/:versionId/edit" element={<MasterVersionPage type="panel" editable/>}/>

          <Route path="masters/project" element={<ProjectMasterPage/>}/>
          <Route path="masters/project/new" element={<MasterVersionPage type="project" createMode/>}/>
          <Route path="masters/project/:id/view" element={<MasterVersionPage type="project"/>}/>
          <Route path="masters/project/:id/edit" element={<MasterVersionPage type="project" editable/>}/>

          <Route path="masters/planning-grid" element={<PlanningGridMasterPage/>}/>
          <Route path="masters/planning-grid/new" element={<PlanningGridMasterPage mode="new"/>}/>
          <Route path="masters/planning-grid/:id/view" element={<PlanningGridMasterPage mode="view"/>}/>
          <Route path="masters/planning-grid/:id/edit" element={<PlanningGridMasterPage mode="edit"/>}/>

            <Route path="*" element={<Navigate to="/inquiries" replace/>}/>
          </Route>
        </Route>
      </Routes>
    </StoreProvider>
  );
}

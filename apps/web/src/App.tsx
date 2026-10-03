import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdministrationAdminDetailPage } from "./pages/AdministrationAdminDetailPage.js";
import { AdministrationAdminsListPage } from "./pages/AdministrationAdminsListPage.js";
import { AdministrationAuditDetailPage } from "./pages/AdministrationAuditDetailPage.js";
import { AdministrationAuditPage } from "./pages/AdministrationAuditPage.js";
import { AdministrationPermissionsPage } from "./pages/AdministrationPermissionsPage.js";
import { AdministrationRoleDetailPage } from "./pages/AdministrationRoleDetailPage.js";
import { AdministrationRolesListPage } from "./pages/AdministrationRolesListPage.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { AdminShellLayout } from "./pages/AdminShellLayout.js";
import { AppIssuesListPage } from "./pages/AppIssuesListPage.js";
import { ApprovalDetailPage } from "./pages/ApprovalDetailPage.js";
import { ApprovalsListPage } from "./pages/ApprovalsListPage.js";
import { CampaignDetailPage } from "./pages/CampaignDetailPage.js";
import { CampaignsListPage } from "./pages/CampaignsListPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { AnalyticsPage } from "./pages/AnalyticsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotificationsListPage } from "./pages/NotificationsListPage.js";
import { RewardDetailPage } from "./pages/RewardDetailPage.js";
import { RewardsListPage } from "./pages/RewardsListPage.js";
import { RiskCaseDetailPage } from "./pages/RiskCaseDetailPage.js";
import { RiskCasesListPage } from "./pages/RiskCasesListPage.js";
import { RiskSignalsListPage } from "./pages/RiskSignalsListPage.js";
import { SecurityActionsListPage } from "./pages/SecurityActionsListPage.js";
import { SecurityCaseDetailPage } from "./pages/SecurityCaseDetailPage.js";
import { SecurityCasesListPage } from "./pages/SecurityCasesListPage.js";
import { SecurityEventsListPage } from "./pages/SecurityEventsListPage.js";
import { SecurityPosturePage } from "./pages/SecurityPosturePage.js";
import { SupportCaseDetailPage } from "./pages/SupportCaseDetailPage.js";
import { SupportCasesListPage } from "./pages/SupportCasesListPage.js";
import { SystemHealthPage } from "./pages/SystemHealthPage.js";
import { UserDetailPage } from "./pages/UserDetailPage.js";
import { UsersListPage } from "./pages/UsersListPage.js";

const AppRoutes = () => {
  const { state } = useAuth();

  if (state.status === "loading") {
    return <p>Loading…</p>;
  }

  if (state.status === "unauthenticated") {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AdminShellLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analytics/:section" element={<AnalyticsPage />} />
        <Route path="/system-health" element={<SystemHealthPage />} />
        <Route path="/users" element={<UsersListPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/support/cases" element={<SupportCasesListPage />} />
        <Route path="/support/cases/:id" element={<SupportCaseDetailPage />} />
        <Route path="/support/app-issues" element={<AppIssuesListPage />} />
        <Route path="/campaigns" element={<CampaignsListPage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/rewards" element={<RewardsListPage />} />
        <Route path="/rewards/:id" element={<RewardDetailPage />} />
        <Route path="/risk/signals" element={<RiskSignalsListPage />} />
        <Route path="/risk/cases" element={<RiskCasesListPage />} />
        <Route path="/risk/cases/:id" element={<RiskCaseDetailPage />} />
        <Route path="/security/events" element={<SecurityEventsListPage />} />
        <Route path="/security/cases" element={<SecurityCasesListPage />} />
        <Route path="/security/cases/:id" element={<SecurityCaseDetailPage />} />
        <Route path="/security/actions" element={<SecurityActionsListPage />} />
        <Route path="/security/posture" element={<SecurityPosturePage />} />
        <Route path="/administration/admins" element={<AdministrationAdminsListPage />} />
        <Route path="/administration/admins/:id" element={<AdministrationAdminDetailPage />} />
        <Route path="/administration/roles" element={<AdministrationRolesListPage />} />
        <Route path="/administration/roles/:id" element={<AdministrationRoleDetailPage />} />
        <Route path="/administration/permissions" element={<AdministrationPermissionsPage />} />
        <Route path="/administration/audit" element={<AdministrationAuditPage />} />
        <Route path="/administration/audit/:id" element={<AdministrationAuditDetailPage />} />
        <Route path="/approvals" element={<ApprovalsListPage />} />
        <Route path="/approvals/:id" element={<ApprovalDetailPage />} />
        <Route path="/notifications" element={<NotificationsListPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
);

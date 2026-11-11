import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { OverviewDashboardPage } from './pages/overview/OverviewDashboardPage';
import { TransactionsPage } from './pages/transactions/TransactionsPage';
import { InvoicesPayablesPage } from './pages/invoices-payables/InvoicesPayablesPage';
import { BudgetsPage } from './pages/budgets/BudgetsPage';
import { CashFlowPage } from './pages/cash-flow/CashFlowPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { FinMemoryPage } from './pages/finmemory/FinMemoryPage';
import { RiskCenterPage } from './pages/risk-center/RiskCenterPage';
import { ScenarioPlanningPage } from './pages/scenario-planning/ScenarioPlanningPage';
import { AiOrchestrationPage } from './pages/ai-orchestration/AiOrchestrationPage';
import { AiAssistantPage } from './pages/ai-assistant/AiAssistantPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { TasksNotificationsPage } from './pages/tasks-notifications/TasksNotificationsPage';
import { AdminPage } from './pages/admin/AdminPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Public Landing & Demo Entry */}
          <Route path="/" element={<LandingPage />} />

          {/* Core Modules wrapped in AppShell */}
          <Route
            path="/overview"
            element={
              <AppShell>
                <OverviewDashboardPage />
              </AppShell>
            }
          />
          <Route
            path="/transactions"
            element={
              <AppShell>
                <TransactionsPage />
              </AppShell>
            }
          />
          <Route
            path="/invoices-payables"
            element={
              <AppShell>
                <InvoicesPayablesPage />
              </AppShell>
            }
          />
          <Route
            path="/budgets"
            element={
              <AppShell>
                <BudgetsPage />
              </AppShell>
            }
          />
          <Route
            path="/cash-flow"
            element={
              <AppShell>
                <CashFlowPage />
              </AppShell>
            }
          />
          <Route
            path="/analytics"
            element={
              <AppShell>
                <AnalyticsPage />
              </AppShell>
            }
          />
          <Route
            path="/finmemory"
            element={
              <AppShell>
                <FinMemoryPage />
              </AppShell>
            }
          />
          <Route
            path="/risk-center"
            element={
              <AppShell>
                <RiskCenterPage />
              </AppShell>
            }
          />
          <Route
            path="/ai-assistant"
            element={
              <AppShell>
                <AiAssistantPage />
              </AppShell>
            }
          />
          <Route
            path="/ai-orchestration"
            element={
              <AppShell>
                <AiOrchestrationPage />
              </AppShell>
            }
          />
          <Route
            path="/scenarios"
            element={
              <AppShell>
                <ScenarioPlanningPage />
              </AppShell>
            }
          />
          <Route path="/scenario-planning" element={<Navigate to="/scenarios" replace />} />
          <Route
            path="/reports"
            element={
              <AppShell>
                <ReportsPage />
              </AppShell>
            }
          />
          <Route
            path="/tasks-notifications"
            element={
              <AppShell>
                <TasksNotificationsPage />
              </AppShell>
            }
          />
          <Route
            path="/admin"
            element={
              <AppShell>
                <AdminPage />
              </AppShell>
            }
          />

          {/* Convenience Alias Redirects */}
          <Route path="/risk" element={<Navigate to="/risk-center" replace />} />
          <Route path="/assistant" element={<Navigate to="/ai-assistant" replace />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

import React, { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth/auth-context';

const Login = React.lazy(() => import('@/features/auth/pages/Login'));
const Dashboard = React.lazy(() => import('@/features/dashboard/pages/Dashboard'));
const WorkflowList = React.lazy(() => import('@/features/workflows/pages/WorkflowList'));
const WorkflowBuilder = React.lazy(() => import('@/features/workflows/pages/WorkflowBuilder'));
const CronList = React.lazy(() => import('@/features/workflows/pages/CronList'));
const ExecutionList = React.lazy(() => import('@/features/workflows/pages/ExecutionList'));
const ExecutionView = React.lazy(() => import('@/features/workflows/pages/ExecutionView'));
const WebhookTest = React.lazy(() => import('@/features/workflows/pages/WebhookTest'));
const SecretList = React.lazy(() => import('@/features/secrets/pages/SecretList'));
const SecretView = React.lazy(() => import('@/features/secrets/pages/SecretView'));
const SecretEdit = React.lazy(() => import('@/features/secrets/pages/SecretEdit'));

const Loading = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export const Router = () => {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {isAuthenticated ? (
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workflows" element={<WorkflowList />} />
              <Route path="/workflows/:id" element={<WorkflowBuilder />} />
              <Route path="/crons" element={<CronList />} />
              <Route path="/executions" element={<ExecutionList />} />
              <Route path="/executions/:id" element={<ExecutionView />} />
              <Route path="/testing/webhooks" element={<WebhookTest />} />
              <Route path="/secrets" element={<SecretList />} />
              <Route path="/secrets/:id" element={<SecretView />} />
              <Route path="/secrets/:id/edit" element={<SecretEdit />} />
            </Route>
          ) : (
            <Route path="*" element={<Login />} />
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

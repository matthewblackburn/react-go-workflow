import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  Send,
  Workflow,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { CreateWorkflowDialog } from '@/components/dialogs/CreateWorkflowDialog';
import { Badge } from '@/components/ui/badge';

interface DashboardStats {
  total_workflows: number;
  active_count: number;
  draft_count: number;
  total_executions: number;
  success_count: number;
  failure_count: number;
  running_count: number;
  cancelled_count: number;
  recent_executions: RecentExec[];
}

interface RecentExec {
  id: string;
  status: string;
  trigger_type: string;
  date_created?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  edges?: {
    workflow?: {
      id: string;
      name: string;
    };
  };
}

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  completed: {
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    label: 'Completed',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  failed: {
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    label: 'Failed',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  running: {
    icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    label: 'Running',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  pending: {
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
};

const triggerLabels: Record<string, string> = {
  manual: 'Manual',
  cron: 'Cron',
  webhook: 'Webhook',
  database_event: 'DB Event',
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(startStr?: string, endStr?: string): string | null {
  if (!startStr || !endStr) return null;
  const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatCard({
  icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
        {icon}
        {label}
      </div>
      <p className={`mt-2 font-bold text-3xl ${color ?? ''}`}>{value}</p>
      {detail && <p className="mt-1 text-muted-foreground text-xs">{detail}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/bff/dashboard'),
    refetchInterval: 10000,
  });

  const successRate =
    stats && stats.total_executions > 0
      ? Math.round((stats.success_count / stats.total_executions) * 100)
      : null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="font-bold text-2xl tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your workflows and executions</p>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid gap-4 md:grid-cols-5">
        <StatCard
          icon={<Workflow className="h-4 w-4" />}
          label="Workflows"
          value={isLoading ? '-' : (stats?.total_workflows ?? 0)}
          detail={`${stats?.active_count ?? 0} active, ${stats?.draft_count ?? 0} draft`}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Total Runs"
          value={isLoading ? '-' : (stats?.total_executions ?? 0)}
          detail={stats?.running_count ? `${stats.running_count} running now` : undefined}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          label="Successful"
          value={isLoading ? '-' : (stats?.success_count ?? 0)}
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          label="Failed"
          value={isLoading ? '-' : (stats?.failure_count ?? 0)}
          color="text-red-600 dark:text-red-400"
        />
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <Activity className="h-4 w-4" />
            Success Rate
          </div>
          <p className="mt-2 font-bold text-3xl">
            {isLoading ? '-' : successRate !== null ? `${successRate}%` : '—'}
          </p>
          {successRate !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${successRate}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent executions — takes 2 columns */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-lg">Recent Executions</h2>
            <Link
              to="/executions"
              className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!stats?.recent_executions?.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No executions yet</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Run a workflow to see results here
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Workflow
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Trigger
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Duration
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_executions.map((exec) => {
                    const cfg = statusConfig[exec.status] ?? statusConfig.pending;
                    const duration = formatDuration(exec.started_at, exec.completed_at);
                    return (
                      <tr
                        key={exec.id}
                        className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50"
                        onClick={() => navigate(`/executions/${exec.id}`)}
                      >
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className={`gap-1 text-[10px] ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {exec.edges?.workflow?.name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {triggerLabels[exec.trigger_type] ?? exec.trigger_type}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {exec.status === 'running' ? (
                            <span className="text-blue-500">Running...</span>
                          ) : (
                            (duration ?? '—')
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {timeAgo(exec.started_at ?? exec.date_created)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 font-semibold text-lg">Quick Actions</h2>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="rounded-md bg-primary/10 p-2">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Create Workflow</p>
                <p className="text-muted-foreground text-xs">Build a new automation</p>
              </div>
            </button>
            <Link
              to="/workflows"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="rounded-md bg-primary/10 p-2">
                <Workflow className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Browse Workflows</p>
                <p className="text-muted-foreground text-xs">View and manage workflows</p>
              </div>
            </Link>
            <Link
              to="/testing/webhooks"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="rounded-md bg-primary/10 p-2">
                <Send className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Test Webhook</p>
                <p className="text-muted-foreground text-xs">Send a test payload to a workflow</p>
              </div>
            </Link>
            <Link
              to="/secrets"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="rounded-md bg-primary/10 p-2">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Manage Secrets</p>
                <p className="text-muted-foreground text-xs">API keys and credentials</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
      <CreateWorkflowDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

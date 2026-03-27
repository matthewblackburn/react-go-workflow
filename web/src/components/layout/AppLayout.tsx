import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Clock,
  KeyRound,
  LayoutDashboard,
  List,
  LogOut,
  Moon,
  Send,
  Sun,
  Workflow,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { notificationApi } from '@/api/notifications';
import { useAuth } from '@/lib/auth/auth-context';
import type { AppNotification } from '@/types/workflow';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/executions', label: 'Executions', icon: List },
  { to: '/crons', label: 'Crons', icon: Clock },
  { to: '/testing/webhooks', label: 'Webhook Test', icon: Send },
  { to: '/secrets', label: 'Secrets', icon: KeyRound },
];

const severityColors: Record<string, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Single query for both count and list — always runs, no sync issues
  const { data: notifData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationApi.list({ limit: 10, status: 'unread' }),
    refetchInterval: 10000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const count = notifData?.total ?? 0;
  const notifications: AppNotification[] = notifData?.data ?? [];

  const handleClick = (n: AppNotification) => {
    markReadMutation.mutate(n.id);
    setOpen(false);
    navigate(`/executions/${n.workflow_execution_id}`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="absolute top-full right-0 z-50 mt-1 w-80 rounded-lg border bg-popover shadow-lg"
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="font-medium text-sm">Notifications</span>
              {count > 0 && (
                <button
                  type="button"
                  className="text-primary text-xs hover:underline"
                  onClick={() => markAllReadMutation.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  No unread notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                    onClick={() => handleClick(n)}
                  >
                    <span
                      className={`mt-0.5 text-lg leading-none ${severityColors[n.severity] ?? severityColors.info}`}
                    >
                      •
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{n.title}</p>
                      {n.message && (
                        <p className="truncate text-muted-foreground text-xs">{n.message}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(n.date_created).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const AppLayout = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { clearToken } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <Workflow className="h-5 w-5" />
            <span>Workflow Builder</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to !== '/' && location.pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={clearToken}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

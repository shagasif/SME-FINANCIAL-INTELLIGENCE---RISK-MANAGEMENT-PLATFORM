import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  ListTodo,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPatch, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatDate } from '../../utils/formatters';
import {
  TaskPriority,
  TaskStatus,
  type FollowUpTask,
  type Notification,
} from '../../types/reports.types';

export function TasksNotificationsPage() {
  const { activeOrg, isAuditor } = useAuth();
  const activeOrgId = activeOrg?.id;

  const [activeTab, setActiveTab] = useState<'TASKS' | 'NOTIFICATIONS'>('TASKS');

  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Create Task Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    Promise.allSettled([
      apiGet<FollowUpTask[]>(`/v1/organizations/${activeOrgId}/tasks`),
      apiGet<Notification[]>(`/v1/organizations/${activeOrgId}/notifications`),
    ])
      .then(([tasksRes, notifsRes]) => {
        if (!isMounted) return;

        if (tasksRes.status === 'fulfilled') {
          const raw = tasksRes.value;
          const list = Array.isArray(raw)
            ? raw
            : (raw as unknown as { items?: FollowUpTask[]; data?: FollowUpTask[] })?.items ||
              (raw as unknown as { items?: FollowUpTask[]; data?: FollowUpTask[] })?.data ||
              [];
          setTasks(list);
        }

        if (notifsRes.status === 'fulfilled') {
          const raw = notifsRes.value;
          const list = Array.isArray(raw)
            ? raw
            : (raw as unknown as { items?: Notification[]; data?: Notification[] })?.items ||
              (raw as unknown as { items?: Notification[]; data?: Notification[] })?.data ||
              [];
          setNotifications(list);
        }

        setError(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setError('Failed to load tasks and notifications.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !taskTitle.trim()) return;

    setIsSubmittingTask(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/tasks`, {
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        priority: taskPriority,
        dueDate: taskDueDate,
      });
      setIsCreateModalOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to create follow-up task.');
      }
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
    if (isAuditor || !activeOrgId) return;

    try {
      await apiPatch(`/v1/organizations/${activeOrgId}/tasks/${taskId}`, {
        status,
      });
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update task status.');
      }
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    if (isAuditor || !activeOrgId) return;

    try {
      await apiPatch(`/v1/organizations/${activeOrgId}/notifications/${notifId}/read`, {});
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)));
    } catch {
      // Optimistic update fallback
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-[var(--brand-primary)]" />
            Financial Tasks & Alerts Hub
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Month-end close checklists, audit follow-ups, and real-time financial warning
            notifications.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh tasks and notifications"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {!isAuditor && activeTab === 'TASKS' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Task
            </Button>
          )}
        </div>
      </div>

      {/* Auditor Notice */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">Auditor Mode Active</span>
            <span className="leading-relaxed opacity-90">
              Tasks and organizational alert logs are visible for inspection. Task mutations and
              marking alerts as read are blocked.
            </span>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
        <button
          onClick={() => setActiveTab('TASKS')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'TASKS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5" />
          Follow-Up Tasks ({tasks.length})
        </button>

        <button
          onClick={() => setActiveTab('NOTIFICATIONS')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'NOTIFICATIONS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Alerts Feed
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] text-white font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: TASKS LIST */}
      {activeTab === 'TASKS' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--text-muted)]">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 opacity-60 mb-2" />
              Zero pending follow-up tasks. Month-end compliance in good standing.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Priority</th>
                    <th className="py-3 px-4 font-semibold">Task Title & Details</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Due Date</th>
                    <th className="py-3 px-4 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                            task.priority === TaskPriority.CRITICAL
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : task.priority === TaskPriority.HIGH
                                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-semibold text-[var(--text-primary)]">{task.title}</div>
                        <div className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                          {task.description}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            task.status === TaskStatus.COMPLETED
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : task.status === TaskStatus.IN_PROGRESS
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                        {task.dueDate ? formatDate(task.dueDate) : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {!isAuditor && task.status !== TaskStatus.COMPLETED && (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateTaskStatus(task.id, TaskStatus.IN_PROGRESS)
                              }
                              className="h-6 px-2 text-[10px]"
                            >
                              In Progress
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateTaskStatus(task.id, TaskStatus.COMPLETED)}
                              className="h-6 px-2 text-[10px] text-emerald-600"
                            >
                              Complete
                            </Button>
                          </div>
                        )}
                        {isAuditor && (
                          <span className="text-[10px] text-[var(--text-muted)]">Locked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NOTIFICATIONS FEED */}
      {activeTab === 'NOTIFICATIONS' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs divide-y divide-[var(--border-subtle)]">
          {notifications.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--text-muted)]">
              <Bell className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" />
              Zero notifications. Platform health nominal.
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                  !notif.isRead ? 'bg-[var(--surface-elevated)]/30' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {notif.priority === 'HIGH' || notif.priority === 'CRITICAL' ? (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    ) : (
                      <Info className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      {notif.title}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                      {formatDate(notif.createdAt)}
                    </span>
                  </div>
                </div>

                {!notif.isRead && !isAuditor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkNotificationRead(notif.id)}
                    className="h-6 px-2 text-[10px]"
                  >
                    Mark as Read
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create Financial Task"
        >
          <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
            {modalError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {modalError}
              </div>
            )}

            <Input
              id="taskTitle"
              label="Task Title *"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Reconcile Stripe payment batch #418"
              required
            />

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Description / Action Items
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Include invoice reference numbers or discrepancy amounts..."
                rows={3}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                  Priority
                </label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
                >
                  <option value={TaskPriority.LOW}>LOW</option>
                  <option value={TaskPriority.MEDIUM}>MEDIUM</option>
                  <option value={TaskPriority.HIGH}>HIGH</option>
                  <option value={TaskPriority.CRITICAL}>CRITICAL</option>
                </select>
              </div>

              <Input
                id="taskDueDate"
                label="Due Date"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmittingTask}
                disabled={!taskTitle.trim()}
              >
                Create Task
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

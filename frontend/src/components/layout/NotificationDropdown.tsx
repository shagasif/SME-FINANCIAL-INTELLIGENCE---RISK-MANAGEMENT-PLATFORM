import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';

export interface AppNotification {
  id: string;
  organizationId: string;
  userId?: string | null;
  title: string;
  message: string;
  severity?: string;
  priority?: string;
  category?: string;
  type?: string;
  isRead: boolean;
  linkPath?: string | null;
  link?: string | null;
  createdAt: string;
}

export interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrgId?: string;
  notifications: AppNotification[];
  isLoading: boolean;
  onNotificationRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

function getSeverityBadge(severity?: string) {
  const norm = (severity || 'MEDIUM').toUpperCase();
  switch (norm) {
    case 'CRITICAL':
      return {
        icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />,
        badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
      };
    case 'HIGH':
      return {
        icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />,
        badgeClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
      };
    case 'LOW':
      return {
        icon: <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />,
        badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
      };
    case 'MEDIUM':
    default:
      return {
        icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
        badgeClass: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
      };
  }
}

export function NotificationDropdown({
  isOpen,
  onClose,
  notifications,
  isLoading,
  onNotificationRead,
  onMarkAllRead,
}: NotificationDropdownProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [markingAll, setMarkingAll] = useState(false);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredList =
    filter === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await onNotificationRead(notif.id);
    }
    const target = notif.linkPath || notif.link;
    if (target) {
      onClose();
      navigate(target);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications panel"
      className="absolute top-full mt-2 right-0 z-50 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[520px] transition-all animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 bg-[var(--surface-canvas)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Bell className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {unreadCount} new
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium">
              Caught up
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)] px-2 py-1 rounded-md hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer disabled:opacity-50"
              title="Mark all notifications as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer sm:hidden"
            aria-label="Close notification panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 px-3.5 pt-2 pb-1 border-b border-[var(--border-subtle)]/60 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'ALL'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'UNREAD'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/60 min-h-[160px]">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-start gap-3">
                <div className="w-4 h-4 rounded-full bg-[var(--surface-elevated)] shrink-0 mt-1" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-[var(--surface-elevated)] rounded w-3/4" />
                  <div className="h-2.5 bg-[var(--surface-elevated)] rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--text-muted)]">
            <div className="w-10 h-10 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center mb-2.5 text-[var(--text-muted)]">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="font-semibold text-[var(--text-primary)] text-center max-w-[260px]">
              You&apos;re all caught up! New alerts and updates will appear here.
            </p>
          </div>
        ) : (
          filteredList.map((notif) => {
            const badge = getSeverityBadge(notif.severity || notif.priority);
            const target = notif.linkPath || notif.link;

            return (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`group p-3 sm:p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                  notif.isRead
                    ? 'hover:bg-[var(--surface-elevated)]/40 opacity-75 hover:opacity-100'
                    : 'bg-[var(--surface-elevated)]/25 hover:bg-[var(--surface-elevated)]/50'
                }`}
              >
                <div className="mt-0.5">{badge.icon}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span
                      className={`text-xs truncate ${
                        notif.isRead
                          ? 'font-medium text-[var(--text-secondary)]'
                          : 'font-semibold text-[var(--text-primary)]'
                      }`}
                    >
                      {notif.title}
                    </span>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[var(--brand-primary)] shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed mb-1.5">
                    {notif.message}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-mono px-1.5 py-0.2 rounded border uppercase font-medium ${badge.badgeClass}`}
                      >
                        {notif.severity || notif.priority || 'INFO'}
                      </span>
                      {notif.category && (
                        <span className="font-mono text-[9px] text-[var(--text-muted)] truncate max-w-[120px]">
                          {notif.category}
                        </span>
                      )}
                    </div>
                    <span>{formatDate(notif.createdAt)}</span>
                  </div>
                </div>

                {target && (
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 sm:p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-canvas)]/40 text-center shrink-0">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/tasks-notifications');
          }}
          className="text-xs font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          <span>View all tasks &amp; notifications</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

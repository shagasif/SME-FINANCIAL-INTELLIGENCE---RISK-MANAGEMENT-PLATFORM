import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { apiGet, apiPatch } from '../../services/apiClient';
import { NotificationDropdown, type AppNotification } from './NotificationDropdown';

export interface TopHeaderProps {
  onOpenMobileNav: () => void;
}

export function TopHeader({ onOpenMobileNav }: TopHeaderProps) {
  const { user, activeOrg, memberships, switchOrganization, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);

  const orgMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!activeOrg?.id) {
      setNotifications([]);
      return;
    }
    setIsNotificationsLoading(true);
    try {
      const res = await apiGet<AppNotification[]>(
        `/v1/organizations/${activeOrg.id}/notifications`,
      );
      const list = Array.isArray(res)
        ? res
        : (res as unknown as { items?: AppNotification[]; data?: AppNotification[] })?.items ||
          (res as unknown as { items?: AppNotification[]; data?: AppNotification[] })?.data ||
          [];
      setNotifications(list);
    } catch {
      // Keep existing list on transient failure
    } finally {
      setIsNotificationsLoading(false);
    }
  }, [activeOrg?.id]);

  useEffect(() => {
    if (user && activeOrg?.id) {
      void fetchNotifications();
    } else {
      setNotifications([]);
    }
  }, [user, activeOrg?.id, fetchNotifications]);

  const handleNotificationRead = async (id: string) => {
    if (!activeOrg?.id) return;
    try {
      await apiPatch(`/v1/organizations/${activeOrg.id}/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!activeOrg?.id) return;
    try {
      await apiPatch(`/v1/organizations/${activeOrg.id}/notifications/read-all`, {});
    } catch {
      const unread = notifications.filter((n) => !n.isRead);
      await Promise.allSettled(
        unread.map((n) =>
          apiPatch(`/v1/organizations/${activeOrg.id}/notifications/${n.id}/read`, {}),
        ),
      );
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setIsOrgMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 sm:px-6 flex items-center justify-between z-20 shrink-0 relative">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Nav Button */}
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Organization Workspace Selector */}
        {activeOrg ? (
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => setIsOrgMenuOpen(!isOrgMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 hover:bg-[var(--surface-elevated)] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer text-sm font-semibold text-[var(--text-primary)]"
              aria-expanded={isOrgMenuOpen}
              aria-label="Select organization workspace"
            >
              <Building2 className="hidden sm:block w-4 h-4 text-[var(--accent-teal)] shrink-0" />
              <span className="max-w-[130px] sm:max-w-[220px] truncate">{activeOrg.name}</span>
              <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                {activeOrg.baseCurrency}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            </button>

            {isOrgMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--surface-card)]/90 backdrop-blur-md shadow-2xl py-1.5 z-50 transition-all duration-200">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  Switch Workspace
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {memberships.map((m) => {
                    const isSelected = m.organizationId === activeOrg.id;
                    return (
                      <button
                        key={m.organizationId}
                        onClick={() => {
                          switchOrganization(m.organizationId);
                          setIsOrgMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--surface-elevated)] font-semibold text-[var(--text-primary)]'
                            : 'hover:bg-[var(--surface-elevated)]/50 text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <p className="truncate">{m.organizationName}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {m.role.replace('_', ' ')}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-[var(--accent-teal)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/40 text-xs font-medium text-[var(--text-muted)]">
            <Building2 className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <span>No Organization Selected</span>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Theme Mode Switcher */}
        <button
          onClick={toggleTheme}
          className="hidden sm:flex p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        {/* Notifications Icon (when user is authenticated) */}
        {user && (
          <div className="sm:relative" ref={notificationMenuRef}>
            <button
              onClick={() => setIsNotificationsOpen((prev) => !prev)}
              className={`relative p-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                isNotificationsOpen
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
              }`}
              aria-label="View notifications"
              title="Notifications"
              aria-expanded={isNotificationsOpen}
              aria-haspopup="dialog"
            >
              <Bell className="w-4 h-4" />
              {notifications.filter((n) => !n.isRead).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in-50 duration-150">
                  {notifications.filter((n) => !n.isRead).length > 9
                    ? '9+'
                    : notifications.filter((n) => !n.isRead).length}
                </span>
              )}
            </button>

            <NotificationDropdown
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              activeOrgId={activeOrg?.id}
              notifications={notifications}
              isLoading={isNotificationsLoading}
              onNotificationRead={handleNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
            />
          </div>
        )}

        {/* User Profile Menu or Sign In CTA */}
        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 pr-1.5 sm:pr-1 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
              aria-expanded={isUserMenuOpen}
              aria-label="User profile options"
            >
              <div className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] text-[var(--accent-primary)] font-bold text-xs flex items-center justify-center border border-[var(--border-subtle)]">
                {user.fullName ? (
                  user.fullName[0].toUpperCase()
                ) : (
                  <UserIcon className="w-3.5 h-3.5" />
                )}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-[var(--text-primary)] max-w-[120px] truncate">
                {user.fullName || user.email}
              </span>
              <ChevronDown className="hidden sm:block w-3 h-3 text-[var(--text-muted)]" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--surface-card)]/90 backdrop-blur-md shadow-2xl py-2 z-50 transition-all duration-200">
                <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {user.fullName}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                  {user.isPlatformAdmin && (
                    <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--accent-teal)]">
                      Platform Administrator
                    </span>
                  )}
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      void logout().then(() => navigate('/', { replace: true }));
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--status-err-text)] hover:bg-[var(--status-err-bg)]/50 transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/login"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white shadow-xs transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}

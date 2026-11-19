import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Cpu,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  PieChart,
  Receipt,
  Settings,
  ShieldAlert,
  Sliders,
  Sun,
  TrendingUp,
  User as UserIcon,
  X,
} from 'lucide-react';
import { MAIN_NAVIGATION_ITEMS } from '../../config/navigation.config';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { SmeLogo } from '../ui/SmeLogo';
import { RoleType } from '../../types/auth.types';

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  Receipt,
  FileText,
  PieChart,
  TrendingUp,
  Activity,
  Database,
  ShieldAlert,
  Cpu,
  Sliders,
  BarChart3,
  Bell,
  Settings,
};

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { hasRole, activeRole, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredNavItems = MAIN_NAVIGATION_ITEMS.filter((item) =>
    activeRole ? hasRole(item.allowedRoles as RoleType[]) : true,
  );

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative w-4/5 max-w-xs bg-[var(--surface-sidebar)] text-[var(--text-primary)] border-r border-[var(--border-subtle)] flex flex-col justify-between z-10 shadow-2xl">
        <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <SmeLogo className="h-6 sm:h-8 w-auto shrink-0 drop-shadow-xs" />
            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-bold leading-none text-[var(--text-primary)] whitespace-nowrap">
                Financial Intel
              </span>
              <span className="block text-[7.5px] sm:text-[8.5px] font-semibold tracking-[0.02em] uppercase opacity-75 text-[var(--text-muted)] mt-0.5 sm:mt-1 whitespace-nowrap">
                CLARITY &amp; RISK PLATFORM
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeRole && (
          <div className="px-4 py-2 bg-[var(--surface-elevated)]/40 border-b border-[var(--border-subtle)] text-xs font-semibold text-[var(--accent-teal)]">
            Role: <span className="text-[var(--text-primary)]">{activeRole.replace('_', ' ')}</span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--surface-sidebar-active)] text-[var(--surface-sidebar-active-text)] font-bold border-l-4 border-[var(--surface-sidebar-active-border)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sidebar-hover)]'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-[var(--surface-elevated)] text-[var(--accent-teal)] border border-[var(--border-subtle)]">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Controls: Theme & User Profile */}
        <div className="p-3.5 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-canvas)]/40 shrink-0">
          {/* Functional Light/Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--surface-elevated)]/60 hover:bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              )}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--surface-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
              {theme}
            </span>
          </button>

          {/* User Profile & Account Controls */}
          {user ? (
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-full bg-[var(--surface-elevated)] text-[var(--accent-primary)] font-bold text-xs flex items-center justify-center border border-[var(--border-subtle)] shrink-0">
                  {user.fullName ? (
                    user.fullName[0].toUpperCase()
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {user.fullName || 'User'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout().then(() => navigate('/', { replace: true }));
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--status-err-text)] hover:bg-[var(--status-err-bg)]/50 transition-colors cursor-pointer text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <NavLink
                to="/login"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

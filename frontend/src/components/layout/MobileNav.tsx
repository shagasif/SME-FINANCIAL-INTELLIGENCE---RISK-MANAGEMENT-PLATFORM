import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Cpu,
  Database,
  FileText,
  LayoutDashboard,
  PieChart,
  Receipt,
  Settings,
  ShieldAlert,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import { MAIN_NAVIGATION_ITEMS } from '../../config/navigation.config';
import { useAuth } from '../../context/useAuth';
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
  Bot,
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
  const { hasRole, activeRole } = useAuth();

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
    hasRole(item.allowedRoles as RoleType[]),
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
      <div className="relative w-4/5 max-w-xs bg-[var(--surface-card)] text-[var(--text-primary)] border-r border-[var(--border-subtle)] flex flex-col justify-between z-10 shadow-2xl">
        <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] text-[var(--surface-header-text)] flex items-center justify-center font-bold text-sm shadow-xs">
              SME
            </div>
            <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
              Financial Intel
            </span>
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
                      ? 'bg-[var(--surface-elevated)] text-[var(--accent-teal)] font-bold border-l-4 border-[var(--accent-teal)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]/60'
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

        <div className="p-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          AI Financial Risk Platform v1.0.0
        </div>
      </div>
    </div>
  );
}

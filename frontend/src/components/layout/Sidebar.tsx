import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  LayoutDashboard,
  PieChart,
  Receipt,
  Settings,
  Shield,
  ShieldAlert,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import { MAIN_NAVIGATION_ITEMS } from '../../config/navigation.config';
import { useAuth } from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { SmeLogo } from '../ui/SmeLogo';

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

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hasRole, activeRole, isAuditor } = useAuth();

  const filteredNavItems = MAIN_NAVIGATION_ITEMS.filter((item) =>
    activeRole ? hasRole(item.allowedRoles as RoleType[]) : true,
  );

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] transition-all duration-200 z-30 shrink-0 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <SmeLogo className="h-8 w-auto shrink-0 drop-shadow-xs" />
            <div className="flex flex-col truncate">
              <span className="text-base font-bold tracking-tight leading-none text-[var(--text-primary)] truncate">
                Financial Intel
              </span>
              <span className="block text-[8.5px] font-semibold tracking-[0.02em] uppercase opacity-75 text-[var(--text-muted)] mt-1 whitespace-nowrap">
                CLARITY &amp; RISK PLATFORM
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex items-center justify-center">
            <SmeLogo variant="square" className="w-8 h-8 drop-shadow-xs" />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Role Pill Banner */}
      <div className="px-3 pt-3 pb-1">
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
            isAuditor
              ? 'bg-[var(--status-warn-bg)] text-[var(--status-warn-text)] border-[var(--status-warn-text)]/30'
              : 'bg-[var(--surface-elevated)] text-[var(--accent-teal)] border-[var(--border-subtle)]'
          }`}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" />
          {!isCollapsed && (
            <div className="truncate">
              <span className="uppercase tracking-wider text-[10px] block opacity-75 font-normal">
                {activeRole ? 'Active Role' : 'Workspace Mode'}
              </span>
              <span className="truncate">
                {activeRole ? activeRole.replace('_', ' ') : 'BUSINESS OWNER'}
              </span>
              {isAuditor && (
                <span className="text-[10px] font-normal block text-amber-700 dark:text-amber-300">
                  (Read-Only)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
        {filteredNavItems.map((item) => {
          const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out group ${
                  isActive
                    ? 'bg-[var(--surface-sidebar-active)] text-[var(--surface-sidebar-active-text)] font-semibold shadow-2xs border-l-3 border-[var(--surface-sidebar-active-border)] pl-2.5'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sidebar-hover)] hover:text-[var(--text-primary)] hover:translate-x-0.5'
                } ${isCollapsed ? 'justify-center px-2' : ''}`
              }
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
              {!isCollapsed && (
                <div className="flex items-center justify-between flex-1 truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-[var(--surface-elevated)] text-[var(--accent-teal)] border border-[var(--border-subtle)]">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Info */}
      {!isCollapsed && (
        <div className="p-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between bg-[var(--surface-elevated)]/30">
          <span>Enterprise SaaS</span>
          <span className="font-mono text-[10px]">v1.0.0</span>
        </div>
      )}
    </aside>
  );
}

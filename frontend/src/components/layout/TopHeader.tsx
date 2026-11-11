import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

export interface TopHeaderProps {
  onOpenMobileNav: () => void;
}

export function TopHeader({ onOpenMobileNav }: TopHeaderProps) {
  const { user, activeOrg, memberships, switchOrganization, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const orgMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setIsOrgMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 sm:px-6 flex items-center justify-between z-20 shrink-0">
      <div className="flex items-center gap-3">
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
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer text-sm font-semibold text-[var(--text-primary)]"
              aria-expanded={isOrgMenuOpen}
              aria-label="Select organization workspace"
            >
              <Building2 className="w-4 h-4 text-[var(--accent-teal)] shrink-0" />
              <span className="max-w-[160px] sm:max-w-[220px] truncate">{activeOrg.name}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                {activeOrg.baseCurrency}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {isOrgMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl py-1.5 z-50">
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
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Mode Switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
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
          <button
            className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="View notifications"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
          </button>
        )}

        {/* User Profile Menu or Sign In CTA */}
        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
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
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl py-2 z-50">
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
                      logout();
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
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] hover:bg-[#12372A]/90 text-white shadow-xs transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}

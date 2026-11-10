import { RoleType } from '../types/auth.types';

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  allowedRoles: RoleType[];
  badge?: string;
  category?: 'core' | 'intelligence' | 'ai' | 'management';
}

export const MAIN_NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/overview',
    iconName: 'LayoutDashboard',
    allowedRoles: Object.values(RoleType),
    category: 'core',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    path: '/transactions',
    iconName: 'Receipt',
    allowedRoles: Object.values(RoleType),
    category: 'core',
  },
  {
    id: 'invoices-payables',
    label: 'Invoices & Payables',
    path: '/invoices-payables',
    iconName: 'FileText',
    allowedRoles: Object.values(RoleType),
    category: 'core',
  },
  {
    id: 'budgets',
    label: 'Budgets & Expenses',
    path: '/budgets',
    iconName: 'PieChart',
    allowedRoles: Object.values(RoleType),
    category: 'core',
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    path: '/cash-flow',
    iconName: 'TrendingUp',
    allowedRoles: Object.values(RoleType),
    category: 'intelligence',
  },
  {
    id: 'analytics',
    label: 'Financial Analytics',
    path: '/analytics',
    iconName: 'Activity',
    allowedRoles: Object.values(RoleType),
    category: 'intelligence',
  },
  {
    id: 'finmemory',
    label: 'FinMemory',
    path: '/finmemory',
    iconName: 'Database',
    allowedRoles: Object.values(RoleType),
    badge: 'Memory',
    category: 'intelligence',
  },
  {
    id: 'risk-center',
    label: 'Risk Center',
    path: '/risk-center',
    iconName: 'ShieldAlert',
    allowedRoles: Object.values(RoleType),
    category: 'intelligence',
  },
  {
    id: 'ai-assistant',
    label: 'AI Finance Assistant',
    path: '/ai-assistant',
    iconName: 'Bot',
    allowedRoles: [
      RoleType.PLATFORM_ADMIN,
      RoleType.BUSINESS_OWNER,
      RoleType.FINANCE_MANAGER,
      RoleType.ACCOUNTANT,
      RoleType.OPERATIONS_MANAGER,
      RoleType.FINANCIAL_ANALYST,
    ],
    badge: 'Gemini',
    category: 'ai',
  },
  {
    id: 'ai-orchestration',
    label: 'AI Orchestrator',
    path: '/ai-orchestration',
    iconName: 'Cpu',
    allowedRoles: Object.values(RoleType),
    badge: 'Multi-Agent',
    category: 'ai',
  },
  {
    id: 'scenarios',
    label: 'Scenario Planning',
    path: '/scenarios',
    iconName: 'Sliders',
    allowedRoles: [
      RoleType.PLATFORM_ADMIN,
      RoleType.BUSINESS_OWNER,
      RoleType.FINANCE_MANAGER,
      RoleType.OPERATIONS_MANAGER,
      RoleType.FINANCIAL_ANALYST,
      RoleType.AUDITOR,
    ],
    category: 'intelligence',
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    iconName: 'BarChart3',
    allowedRoles: Object.values(RoleType),
    category: 'management',
  },
  {
    id: 'tasks-notifications',
    label: 'Tasks & Alerts',
    path: '/tasks-notifications',
    iconName: 'Bell',
    allowedRoles: Object.values(RoleType),
    category: 'management',
  },
  {
    id: 'admin',
    label: 'Administration',
    path: '/admin',
    iconName: 'Settings',
    allowedRoles: [
      RoleType.PLATFORM_ADMIN,
      RoleType.BUSINESS_OWNER,
      RoleType.FINANCE_MANAGER,
      RoleType.AUDITOR,
    ],
    category: 'management',
  },
];

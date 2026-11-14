import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  FileSpreadsheet,
  FileText,
  Layers3,
  Menu,
  Moon,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Sun,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../hooks/useTheme';

const ParticleSwarmVisual = lazy(() =>
  import('../components/landing/ParticleSwarmVisual').then(({ ParticleSwarmVisual }) => ({
    default: ParticleSwarmVisual,
  })),
);

type ModuleLink = { label: string; path: string };
type LoginRedirectState = { from: { pathname: string } };
type PlatformModule = {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
};

const platformModules: PlatformModule[] = [
  {
    title: 'Financial Overview & Transactions',
    description: 'See key financial activity and keep transaction records organized.',
    icon: Wallet,
    path: '/overview',
  },
  {
    title: 'Budgets & Expenses',
    description: 'Plan budgets, follow spending, and review variances.',
    icon: CircleDollarSign,
    path: '/budgets',
  },
  {
    title: 'Cash Flow Forecasting',
    description: 'Explore future cash positions and forecast scenarios.',
    icon: TrendingUp,
    path: '/cash-flow',
  },
  {
    title: 'Financial Analytics',
    description: 'Understand performance through metrics and financial trends.',
    icon: BarChart3,
    path: '/analytics',
  },
  {
    title: 'Invoices & Payables',
    description: 'Manage invoices, outstanding payables, and obligations.',
    icon: FileText,
    path: '/invoices-payables',
  },
  {
    title: 'Financial Reports',
    description: 'Review structured reports on financial activity and performance.',
    icon: FileSpreadsheet,
    path: '/reports',
  },
  {
    title: 'Risk Center',
    description: 'Review potential financial warning signs in one place.',
    icon: ShieldAlert,
    path: '/risk-center',
  },
  {
    title: 'AI Orchestration',
    description: 'Coordinate specialized agents across financial workflows.',
    icon: BrainCircuit,
    path: '/ai-orchestration',
  },
  {
    title: 'FinMemory',
    description: 'Capture historical financial snapshots and compare periods.',
    icon: Database,
    path: '/finmemory',
  },
];

const workflows = [
  {
    number: '01',
    title: 'Bring financial information together',
    description: 'Connect accounts, transactions, documents, and financial records.',
  },
  {
    number: '02',
    title: 'Understand your position',
    description: 'Review performance, budgets, expenses, cash flow, and obligations.',
  },
  {
    number: '03',
    title: 'Explore insights',
    description: 'Use analytics and AI workflows to understand patterns and concerns.',
  },
  {
    number: '04',
    title: 'Make informed decisions',
    description: 'Use a clearer financial picture to plan ahead with confidence.',
  },
];

const benefits = [
  {
    title: 'One connected financial workspace',
    description:
      'Move between records, budgets, forecasts, reports, and risk insights in one application.',
    icon: Layers3,
  },
  {
    title: 'See the context behind performance',
    description:
      'Explore financial analytics and historical snapshots alongside day-to-day operations.',
    icon: ScanSearch,
  },
  {
    title: 'Plan with scenarios and forecasts',
    description:
      'Compare forecasting assumptions and review saved versions to inform planning.',
    icon: Activity,
  },
  {
    title: 'Keep decisions grounded in your workflow',
    description:
      'Use AI orchestration and assistant tools to analyze financial information and support decisions.',
    icon: BrainCircuit,
  },
];

const sectionNavigation = [
  { label: 'Modules', href: '#modules' },
  { label: 'AI & Risk', href: '#ai-risk' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Why Us', href: '#why-us' },
];

const footerModules: ModuleLink[] = [
  { label: 'Overview', path: '/overview' },
  { label: 'Cash Flow', path: '/cash-flow' },
  { label: 'Invoices', path: '/invoices-payables' },
  { label: 'Budgets', path: '/budgets' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Risk Center', path: '/risk-center' },
  { label: 'FinMemory', path: '/finmemory' },
  { label: 'AI Orchestration', path: '/ai-orchestration' },
  { label: 'Financial Reports', path: '/reports' },
];

const footerResources: ModuleLink[] = [
  { label: 'Documentation', path: '#how-it-works' },
  { label: 'Guides', path: '#how-it-works' },
  { label: 'AI Governance', path: '#ai-risk' },
  { label: 'Help Center', path: '#final-cta' },
  { label: 'FAQs', path: '#final-cta' },
  { label: 'Release Notes', path: '#modules' },
];

const footerCompany: ModuleLink[] = [
  { label: 'About', path: '#why-us' },
  { label: 'Contact', path: '#final-cta' },
  { label: 'Security & Trust', path: '#why-us' },
];

const linkStyle =
  'w-fit text-sm text-slate-400 transition-colors hover:text-blue-700 focus-visible:text-blue-700 dark:hover:text-blue-300 dark:focus-visible:text-blue-300';

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  centered = true,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
}) {
  return (
    <div
      data-scroll-reveal
      className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}
    >
      {eyebrow && (
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-slate-950 dark:text-white sm:text-4xl"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">{description}</p>
      )}
    </div>
  );
}

function PrimaryLink({
  to,
  state,
  children,
  className = '',
}: {
  to: string;
  state?: LoginRedirectState;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      state={state}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--landing-accent)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/20 transition hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)] focus-visible:outline-offset-4 ${className}`}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function AiWorkflowPreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-4 shadow-lg shadow-blue-950/20 backdrop-blur-xl sm:p-5">
      <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <BrainCircuit aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-900">AI Orchestration</p>
            <p className="text-[10px] text-slate-400">Workflow concept</p>
          </div>
        </div>
        <span className="rounded-md border border-indigo-100 bg-indigo-50/70 px-2 py-1 text-[9px] font-semibold text-indigo-700">
          Workflow preview
        </span>
      </div>
      <div className="relative mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
        {[
          { label: 'Financial data', icon: Database },
          { label: 'Specialist agents', icon: BrainCircuit },
          { label: 'Insights', icon: Sparkles },
        ].map(({ label, icon: Icon }, index) => (
          <div key={label} className="contents">
            <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-preview-bg)] px-1.5 py-2 text-center backdrop-blur-md">
              <Icon
                aria-hidden="true"
                className={`h-4 w-4 ${index === 1 ? 'text-indigo-600' : 'text-blue-600'}`}
              />
              <span className="text-[9px] font-semibold leading-3 text-slate-600">{label}</span>
            </div>
            {index < 2 && <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        ))}
      </div>
      <p className="relative mt-4 text-[10px] leading-4 text-slate-400">
        A visual guide to the existing AI orchestration experience.
      </p>
    </div>
  );
}

function RiskAlertsPreview() {
  const alertTypes = [
    { title: 'Expense pattern review', status: 'Review', tone: 'amber', icon: Activity },
    { title: 'Receivable aging', status: 'Monitor', tone: 'blue', icon: Clock3 },
    { title: 'Cash flow pressure', status: 'Review', tone: 'rose', icon: ArrowDownRight },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-4 shadow-lg shadow-blue-950/20 backdrop-blur-xl sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-900">Risk Center</p>
            <p className="text-[10px] text-slate-400">Alert categories preview</p>
          </div>
        </div>
        <ScanSearch aria-hidden="true" className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-4 space-y-2">
        {alertTypes.map(({ title, status, tone, icon: Icon }) => (
          <div
            key={title}
            className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-preview-bg)] px-3 backdrop-blur-md"
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="flex-1 text-[10px] font-medium text-slate-700 sm:text-xs">
              {title}
            </span>
            <span
              className={`rounded-md px-2 py-1 text-[8px] font-semibold sm:text-[9px] ${
                tone === 'amber'
                  ? 'bg-amber-50 text-amber-700'
                  : tone === 'rose'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-blue-50 text-blue-700'
              }`}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-slate-400">
        Example categories, not live organization alerts.
      </p>
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const getStartedPath = isAuthenticated ? '/overview' : '/login';
  const getStartedState = isAuthenticated ? undefined : { from: { pathname: '/overview' } };
  const appRouteLink = (path: string) =>
    isAuthenticated ? { to: path } : { to: '/login', state: { from: { pathname: path } } };
  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing-page-theme');
    const supportsReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!page || typeof IntersectionObserver === 'undefined' || supportsReducedMotion) return;

    const items = page.querySelectorAll<HTMLElement>('[data-scroll-reveal]');
    if (!items.length) return;

    page.dataset.scrollReveal = 'ready';
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-visible', entry.isIntersecting);
        });
      },
      { rootMargin: '0px 0px -32px 0px', threshold: 0.12 },
    );

    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      delete page.dataset.scrollReveal;
    };
  }, []);

  return (
    <div
      data-theme={theme}
      className="landing-page-theme min-h-screen overflow-hidden bg-[var(--landing-page-bg)] text-slate-900 selection:bg-blue-200 selection:text-slate-950 dark:bg-[var(--landing-page-bg)]"
    >
      <header className="sticky top-0 z-50 bg-[var(--landing-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            aria-label="SME Financial Intel home"
            to="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 text-[10px] font-black tracking-wide text-white shadow-md shadow-blue-900/15">
              SME
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block whitespace-normal text-lg font-bold tracking-tight text-slate-950 dark:text-white sm:text-xl">
                SME Financial Intel
              </span>
              <span className="hidden text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:block">
                Financial Intelligence &amp; Risk Management Platform
              </span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-5 xl:flex">
            {sectionNavigation.map(({ label, href }) => (
              <a key={href} href={href} className={linkStyle}>
                {label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] text-slate-600 transition hover:border-blue-300 hover:text-slate-950 dark:border-slate-800 dark:bg-[var(--landing-card-bg)] dark:text-slate-300 sm:inline-flex"
            >
              {theme === 'dark' ? (
                <Sun aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Moon aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <Link
              to="/login"
              className="hidden rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700 dark:text-slate-300 sm:inline-flex"
            >
              Login
            </Link>
            <PrimaryLink
              to={getStartedPath}
              state={getStartedState}
              className="min-h-10 rounded-lg px-2.5 py-2 text-xs [&>svg]:hidden sm:px-4 sm:text-sm sm:[&>svg]:inline-flex"
            >
              Get Started
            </PrimaryLink>
            <button
              type="button"
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] text-slate-600 xl:hidden dark:border-slate-800 dark:bg-[var(--landing-card-bg)] dark:text-slate-300"
            >
              {isMenuOpen ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Menu aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="bg-[var(--landing-header-bg)] px-4 py-3 xl:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col items-center gap-1">
              {sectionNavigation.map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  onClick={closeMenu}
                  className="w-full rounded-lg px-3 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-[var(--landing-card-hover)]"
                >
                  {label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  closeMenu();
                }}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-[var(--landing-card-hover)] sm:hidden"
              >
                {theme === 'dark' ? (
                  <Sun aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Moon aria-hidden="true" className="h-4 w-4" />
                )}
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
              <Link
                to="/login"
                onClick={closeMenu}
                className="w-full rounded-lg px-3 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-[var(--landing-card-hover)]"
              >
                Login
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section
          id="hero"
          aria-labelledby="hero-heading"
          className="relative scroll-mt-24 overflow-hidden bg-transparent px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10 lg:px-8 lg:pb-20"
        >
          <Suspense fallback={null}>
            <ParticleSwarmVisual />
          </Suspense>
          <div className="landing-hero-glow" aria-hidden="true" />
          <div data-scroll-reveal className="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-10 text-center sm:gap-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            <div className="w-full max-w-3xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--landing-border)] bg-[var(--landing-card-bg)] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300 sm:text-xs">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                Financial Intelligence &amp; Risk Management Platform
              </p>
              <h1
                id="hero-heading"
                className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-5xl lg:text-[3.75rem]"
              >
                Financial Clarity &amp; Risk Control for Growing Businesses.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                Unify your financial records, cash-flow forecasts, and budgets in one intelligent
                platform—turning daily operations into verified insights and proactive risk
                decisions.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <PrimaryLink to={getStartedPath} state={getStartedState}>
                  Get Started
                </PrimaryLink>
                <a
                  href="#modules"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--landing-border)] px-5 py-3 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-[var(--landing-card-hover)] dark:text-white"
                >
                  Explore the platform
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-6 text-sm font-medium text-slate-400">
                Financial clarity. Intelligent insights. Better business decisions.
              </p>
            </div>
          </div>
        </section>

        <section
          id="modules"
          aria-labelledby="modules-heading"
          className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <SectionHeading
                centered
                id="modules-heading"
                eyebrow="Platform modules"
                title="A connected toolkit for financial clarity."
                description="Move from daily operations to analytics, forecasts, and historical context."
              />
              <Link
                {...appRouteLink('/overview')}
                className="mx-auto inline-flex w-fit shrink-0 items-center gap-2 text-sm font-semibold text-blue-700 transition hover:gap-3 dark:text-blue-300"
              >
                Explore the platform
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-9 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {platformModules.map(({ title, description, icon: Icon, path }) => (
                <Link
                  key={title}
                  {...appRouteLink(path)}
                  data-scroll-reveal
                  className="group flex min-h-[12.5rem] w-full flex-col items-center justify-center rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-4 text-center shadow-lg shadow-blue-950/20 backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-blue-400 hover:bg-[var(--landing-card-hover)] hover:shadow-blue-950/30 sm:p-5"
                >
                  <div className="flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-[var(--landing-accent)] group-hover:text-white dark:bg-[var(--landing-card-bg)] dark:text-blue-300">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                  </div>
                  <h3 className="mt-3 w-full text-sm font-semibold leading-5 text-slate-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-2 w-full text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          id="ai-risk"
          aria-labelledby="ai-risk-heading"
          className="scroll-mt-24 bg-transparent px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              centered
              id="ai-risk-heading"
              eyebrow="AI & Risk"
              title="Intelligence and risk awareness, side by side."
              description="Use AI-powered workflows to analyze information while keeping potential financial concerns visible."
            />
            <div className="mt-9 grid gap-4 lg:grid-cols-2">
              <div data-scroll-reveal className="group landing-card-gradient w-full rounded-[1.5rem] p-px transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/25">
                <div className="flex h-full flex-col rounded-[1.3rem] border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-5 shadow-lg shadow-blue-950/20 backdrop-blur-xl transition-colors duration-300 group-hover:border-blue-400/70 group-hover:bg-[var(--landing-card-hover)] sm:p-7">
                  <div className="mx-auto w-full max-w-md text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300">
                      AI Orchestration
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      Put connected workflows to work.
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Coordinate specialized agents to analyze financial information and support
                      informed decisions.
                    </p>
                  </div>
                  <div className="mt-6 flex-1">
                    <AiWorkflowPreview />
                  </div>
                </div>
              </div>
              <div data-scroll-reveal className="group landing-card-gradient w-full rounded-[1.5rem] p-px transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/25">
                <div className="flex h-full flex-col rounded-[1.3rem] border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-5 shadow-lg shadow-blue-950/20 backdrop-blur-xl transition-colors duration-300 group-hover:border-blue-400/70 group-hover:bg-[var(--landing-card-hover)] sm:p-7">
                  <div className="mx-auto w-full max-w-md text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-rose-700 dark:text-rose-300">
                      Risk Center
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      Bring potential warning signs into focus.
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Review risk indicators related to financial activity, receivables, and cash
                      flow.
                    </p>
                  </div>
                  <div className="mt-6 flex-1">
                    <RiskAlertsPreview />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              centered
              id="how-heading"
              eyebrow="How it works"
              title="A practical path from records to decisions."
              description="Follow your financial workflows at each step, from bringing records together to reviewing insights."
            />
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workflows.map(({ number, title, description }) => (
                <article
                  key={number}
                  data-scroll-reveal
                  className="relative w-full rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-5 text-center shadow-lg shadow-blue-950/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-blue-400 hover:bg-[var(--landing-card-hover)] hover:shadow-xl hover:shadow-blue-950/25 sm:p-6"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-bold tracking-[0.16em] text-blue-700 dark:text-blue-300">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-semibold leading-6 text-slate-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="why-us"
          aria-labelledby="why-heading"
          className="scroll-mt-24 bg-transparent px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              centered
              id="why-heading"
              eyebrow="Why Us"
              title="Financial intelligence shaped around your business."
              description="SME Financial Intel brings essential financial operations into one environment—so businesses can make sense of activity, understand change, and plan with more context."
            />
            <div className="mt-9 grid w-full gap-4 sm:grid-cols-2">
              {benefits.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  data-scroll-reveal
                  className="flex w-full flex-col items-center rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-card-bg)] p-5 text-center shadow-lg shadow-blue-950/20 backdrop-blur-xl transition hover:border-blue-400 hover:bg-[var(--landing-card-hover)] sm:p-6"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-sm font-semibold leading-6 text-slate-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {description}
                  </p>
                  <span className="mt-5 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    Platform capability
                    <Check aria-hidden="true" className="h-3 w-3" />
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="final-cta"
          aria-labelledby="final-cta-heading"
          className="scroll-mt-24 px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8"
        >
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-[var(--landing-border)] bg-[var(--landing-card-bg)] px-6 py-12 text-slate-900 shadow-xl shadow-blue-950/20 backdrop-blur-2xl dark:text-white sm:px-10 sm:py-16 lg:px-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-32 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-indigo-400/12 blur-3xl"
            />
            <div data-scroll-reveal className="relative flex flex-col items-center gap-8 text-center">
              <div className="mx-auto max-w-2xl">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                  SME Financial Intel
                </p>
                <h2
                  id="final-cta-heading"
                  className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
                >
                  Bring clarity to your business finances.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Understand performance, monitor risks, and move forward with greater confidence.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to={getStartedPath}
                  state={getStartedState}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--landing-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)]"
                >
                  Get Started
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <a
                  href="#modules"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--landing-border)] px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-[var(--landing-card-hover)] dark:text-white"
                >
                  Explore Modules
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer
        id="site-footer"
        className="bg-transparent px-4 py-8 text-left sm:px-6 lg:px-8"
      >
        <div className="relative z-10 mx-auto max-w-7xl">
          <div data-scroll-reveal className="pb-4">
            <Link
              to="/"
              aria-label="SME Financial Intel home"
              className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl"
            >
              SME Financial Intel
            </Link>
            <p className="mt-1 text-sm text-slate-400">
              Financial Intelligence &amp; Risk Platform
            </p>
          </div>

          <div className="grid gap-6 py-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div data-scroll-reveal>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 dark:text-white">
                Platform
              </h2>
              <ul className="mt-3 space-y-2">
                {footerModules.map(({ label, path }) => (
                  <li key={label}>
                    <Link {...appRouteLink(path)} className={linkStyle}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div data-scroll-reveal>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 dark:text-white">
                Resources
              </h2>
              <ul className="mt-3 space-y-2">
                {footerResources.map(({ label, path }) => (
                  <li key={label}>
                    <a href={path} className={linkStyle}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div data-scroll-reveal>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 dark:text-white">
                Company
              </h2>
              <ul className="mt-3 space-y-2">
                {footerCompany.map(({ label, path }) => (
                  <li key={label}>
                    <a href={path} className={linkStyle}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div data-scroll-reveal>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 dark:text-white">
                Newsletter
              </h2>
              <p className="mt-3 max-w-xs text-sm leading-5 text-slate-400">
                Sign up for financial &amp; product updates
              </p>
              <form className="mt-3 flex w-full items-center rounded-lg border border-[var(--landing-border)] bg-[var(--landing-preview-bg)] p-1">
                <label className="sr-only" htmlFor="footer-newsletter-email">
                  Email address
                </label>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  placeholder="Your email address"
                  disabled
                  aria-describedby="footer-newsletter-note"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled
                  className="shrink-0 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#07090E] disabled:cursor-not-allowed"
                >
                  Subscribe
                </button>
              </form>
              <p id="footer-newsletter-note" className="mt-1 text-xs text-slate-500">
                Sign-up is not enabled yet.
              </p>
            </div>
          </div>

          <div
            id="legal-notice"
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-4 text-xs text-slate-400"
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#00CBA8]" />
              <span>All systems operational</span>
            </div>
            <p className="whitespace-nowrap">© 2026 SME Financial Intel. All rights reserved.</p>
            <div className="flex items-center gap-5 whitespace-nowrap">
              <a href="#legal-notice" className={linkStyle}>
                Privacy policy
              </a>
              <a href="#legal-notice" className={linkStyle}>
                Terms of service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

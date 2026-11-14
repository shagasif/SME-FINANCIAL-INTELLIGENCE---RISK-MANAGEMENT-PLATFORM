import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('LandingPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('renders the remaining landing-page sections in order', () => {
    const { container } = render(<App />);

    const sections = Array.from(container.querySelectorAll('main > section'));
    expect(sections).toHaveLength(6);
    expect(sections.map((section) => section.id)).toEqual([
      'hero',
      'modules',
      'ai-risk',
      'how-it-works',
      'why-us',
      'final-cta',
    ]);
    expect(container.querySelector('#site-footer')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Financial Clarity & Risk Control for Growing Businesses.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Unify your financial records, cash-flow forecasts, and budgets in one intelligent platform—turning daily operations into verified insights and proactive risk decisions.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A connected toolkit for financial clarity.' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Intelligence and risk awareness, side by side.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'A practical path from records to decisions.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Financial intelligence shaped around your business.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See the platform' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bring clarity to your business finances.' }),
    )
      .toBeInTheDocument();
    expect(screen.queryByText('One view of your finances')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Illustrative finance dashboard preview'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Interactive Dashboard Preview')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'SME Financial Intel home' })).toHaveLength(2);
    expect(screen.getByText('Financial Intelligence & Risk Platform')).toBeInTheDocument();
    expect(container.querySelectorAll('#modules a.group')).toHaveLength(9);
    expect(container.querySelector('#modules')).not.toHaveTextContent(/\b0[1-9]\b/);
    expect(screen.queryAllByText('Explore module')).toHaveLength(0);
    expect(container.querySelectorAll('#site-footer h2')).toHaveLength(4);
    expect(
      screen.getByRole('link', { name: 'Modules' }),
    ).toHaveAttribute('href', '#modules');
  });

  it('links all nine modules and omits the AI/risk card CTAs', () => {
    const { container } = render(<App />);

    expect(screen.getAllByRole('link', { name: /Get Started/i })[0]).toHaveAttribute('href', '/login');
    expect(
      screen.queryByRole('link', { name: 'Explore AI Orchestration' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore Risk Center' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Financial Overview & Transactions/ }),
    ).toHaveAttribute('href', '/login');
    expect(container.querySelectorAll('#modules a.group')).toHaveLength(9);
    expect(container.querySelectorAll('#modules a.group[href="/login"]')).toHaveLength(9);
    expect(screen.queryByRole('link', { name: /^AI Finance Assistant/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '#legal-notice',
    );
  });

  it('renders the requested footer columns and a disabled visual-only newsletter form', () => {
    const { container } = render(<App />);
    const footer = container.querySelector<HTMLElement>('#site-footer');

    if (!footer) {
      throw new Error('Landing page footer was not rendered');
    }

    expect(within(footer).getByRole('heading', { name: 'Platform' })).toBeVisible();
    expect(within(footer).getByRole('heading', { name: 'Resources' })).toBeVisible();
    expect(within(footer).getByRole('heading', { name: 'Company' })).toBeVisible();
    expect(within(footer).getByRole('heading', { name: 'Newsletter' })).toBeVisible();

    const platformRoutes = [
      '/overview',
      '/cash-flow',
      '/invoices-payables',
      '/budgets',
      '/analytics',
      '/risk-center',
      '/finmemory',
      '/ai-orchestration',
      '/reports',
    ];
    const footerLinks = within(footer).getAllByRole('link');
    expect(
      footerLinks.filter((link) => link.getAttribute('href') === '/login'),
    ).toHaveLength(platformRoutes.length);
    expect(within(footer).getByLabelText('Email address')).toBeDisabled();
    expect(within(footer).getByRole('button', { name: 'Subscribe' })).toBeDisabled();
    expect(within(footer).getByText('Sign-up is not enabled yet.')).toBeVisible();
    expect(screen.getByText('SME', { exact: true })).toBeVisible();
    expect(screen.queryByText('SFI', { exact: true })).not.toBeInTheDocument();
    expect(within(footer).getByText('All systems operational')).toBeVisible();
    expect(footer.querySelector('#legal-notice')).toHaveTextContent(
      '© 2026 SME Financial Intel. All rights reserved.',
    );
  });

  it('requires login from Get Started and returns to the overview route', async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole('link', { name: /Get Started/i })[0]);

    expect(await screen.findByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
    expect(window.history.state.usr).toMatchObject({ from: { pathname: '/overview' } });
  });

  it('requires login before opening a selected landing-page module', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: /Budgets & Expenses/ }));

    expect(await screen.findByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
    expect(window.history.state.usr).toMatchObject({ from: { pathname: '/budgets' } });
  });

  it('supports switching between light and dark themes', () => {
    const { container } = render(<App />);

    const toggleButton = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(container.querySelector('.landing-page-theme')).toHaveAttribute('data-theme', 'light');

    fireEvent.click(toggleButton);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(container.querySelector('.landing-page-theme')).toHaveAttribute('data-theme', 'dark');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(container.querySelector('.landing-page-theme')).toHaveAttribute('data-theme', 'light');
  });

  it('reveals landing content as it enters the viewport', () => {
    let updateIntersection: ((target: Element, isIntersecting: boolean) => void) | undefined;
    const observerApi: IntersectionObserver = {
      disconnect: vi.fn(),
      observe: vi.fn(),
      root: null,
      rootMargin: '0px',
      scrollMargin: '0px',
      takeRecords: () => [],
      thresholds: [0.12],
      unobserve: vi.fn(),
    };

    class TestIntersectionObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {
        updateIntersection = (target, isIntersecting) => {
          const bounds = target.getBoundingClientRect();
          const entry: IntersectionObserverEntry = {
            boundingClientRect: bounds,
            intersectionRatio: isIntersecting ? 1 : 0,
            intersectionRect: bounds,
            isIntersecting,
            rootBounds: null,
            target,
            time: Date.now(),
          };
          this.callback([entry], observerApi);
        };
      }

      observe() {}

      disconnect() {}

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }

    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const { container } = render(<App />);
    const page = container.querySelector('.landing-page-theme');
    const target = container.querySelector('#how-it-works [data-scroll-reveal]');

    expect(page).toHaveAttribute('data-scroll-reveal', 'ready');
    expect(target).not.toHaveClass('is-visible');
    if (!updateIntersection || !target) {
      throw new Error('Scroll reveal observer or target was not initialized');
    }

    act(() => updateIntersection?.(target, true));
    expect(target).toHaveClass('is-visible');

    act(() => updateIntersection?.(target, false));
    expect(target).not.toHaveClass('is-visible');

    act(() => updateIntersection?.(target, true));
    expect(target).toHaveClass('is-visible');
  });
});

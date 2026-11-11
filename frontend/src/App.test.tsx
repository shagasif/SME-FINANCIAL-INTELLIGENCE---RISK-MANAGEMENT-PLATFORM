import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('LandingPage & Backend API Communication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders the platform title, five core objectives, and verifies live health and database readiness', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/health/ready')) {
        return new Response(
          JSON.stringify({
            status: 'ready',
            service: 'SME Financial Intelligence API',
            database: {
              status: 'connected',
              latencyMs: 3,
            },
            timestamp: '2026-11-09T12:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'SME Financial Intelligence API',
          timestamp: '2026-11-09T12:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /AI-Powered SME Financial Intelligence & Risk Management Platform/i,
      }),
    ).toBeInTheDocument();

    // Verify all 5 required capability pillars are rendered
    expect(screen.getByText('Financial visibility')).toBeInTheDocument();
    expect(screen.getByText('Cash-flow awareness')).toBeInTheDocument();
    expect(screen.getByText('Financial risk monitoring')).toBeInTheDocument();
    expect(screen.getByText('Historical financial intelligence')).toBeInTheDocument();
    expect(screen.getByText('Evidence-based business decisions')).toBeInTheDocument();

    // Wait for API health & DB readiness state to resolve
    await waitFor(() => {
      expect(screen.getByText('Operational (ok)')).toBeInTheDocument();
    });
    expect(screen.getByText(/Connected \(3 ms\)/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('displays an accessible error alert when the backend API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection refused'));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Backend API Unreachable/i);
    expect(alert).toHaveTextContent(/Network connection refused/i);
    expect(screen.getByText('Offline / Unreachable')).toBeInTheDocument();
  });

  it('supports switching between Light Mode and Dark Mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'SME Financial Intelligence API',
          timestamp: '2026-11-09T12:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(<App />);

    const toggleButton = screen.getByRole('button', { name: /Switch to dark mode/i });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(toggleButton);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await waitFor(() => {
      expect(screen.getByText('Operational (ok)')).toBeInTheDocument();
    });
  });

  it('redirects unauthenticated users to the login page when Launch App is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'SME Financial Intelligence API',
          timestamp: '2026-11-09T12:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(<App />);

    const launchAppLinks = screen.getAllByRole('link', { name: /Launch App/i });
    expect(launchAppLinks.length).toBeGreaterThan(0);
    fireEvent.click(launchAppLinks[0]);

    // Verify user is redirected to the Login page
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Financial Intelligence & Risk Platform/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Work Email Address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
  });
});

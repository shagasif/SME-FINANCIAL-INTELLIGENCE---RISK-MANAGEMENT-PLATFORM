import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter } from 'react-router-dom';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { FloatingAiAssistant } from './FloatingAiAssistant';

function mockAuthenticatedUser() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: {
      id: 'usr-1',
      email: 'owner@example.com',
      fullName: 'Jane Owner',
      isPlatformAdmin: false,
    },
    activeOrg: {
      id: 'org-1',
      name: 'Apex Manufacturing',
      slug: 'apex-mfg',
      baseCurrency: 'PKR',
      role: RoleType.BUSINESS_OWNER,
    },
    memberships: [],
    activeRole: RoleType.BUSINESS_OWNER,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    switchOrganization: vi.fn(),
    hasRole: () => true,
    canMutateLedger: true,
    canManageBudgets: true,
    canRunAiWorkflows: true,
    canExportReports: true,
    isAuditor: false,
  });
}

describe('FloatingAiAssistant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens and closes the compact assistant while retaining chat state across app navigation', () => {
    mockAuthenticatedUser();
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <Link to="/reports">Reports</Link>
        <FloatingAiAssistant />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));
    expect(screen.getByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeVisible();

    const input = screen.getByPlaceholderText(/Ask a question about your cash flow/i);
    fireEvent.change(input, { target: { value: 'Check the cash runway' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close AI Finance Assistant chat' }));
    expect(screen.queryByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));
    expect(screen.getByPlaceholderText(/Ask a question about your cash flow/i)).toHaveValue(
      'Check the cash runway',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close AI Finance Assistant chat' }));
    expect(screen.queryByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));

    fireEvent.click(screen.getByRole('link', { name: 'Reports' }));
    expect(screen.getByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeVisible();
    expect(screen.getByPlaceholderText(/Ask a question about your cash flow/i)).toHaveValue(
      'Check the cash runway',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close AI Finance Assistant' }));
    expect(screen.queryByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeNull();
  });

  it('does not render the launcher on public pages', () => {
    mockAuthenticatedUser();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <FloatingAiAssistant />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('floating-ai-assistant')).not.toBeInTheDocument();
  });

  it('preserves multiple responses through close, fullscreen, restore, and page navigation', async () => {
    mockAuthenticatedUser();
    const answers = ['Cash runway is 8.4 months.', 'Working capital is PKR 385,000.00.'];
    let responseIndex = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const index = responseIndex++;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              id: `workflow-${index + 1}`,
              status: 'COMPLETED',
              verificationStatus: 'APPROVED',
              synthesizedResult: {
                executiveSummary: 'Completed FINANCIAL_ANALYSIS across 1 specialist agent(s).',
                selectedSpecialistAgents: ['FINANCE_DATA_ANALYST'],
                specialistFindings: [
                  {
                    agentType: 'FINANCE_DATA_ANALYST',
                    skillResults: [{ summary: answers[index] }],
                  },
                ],
                verifierAudit: {
                  verificationPassed: true,
                  arithmeticVerified: true,
                  citationsVerified: true,
                  checkedSpecialistCount: 1,
                },
                sourceRecordIds: { accountIds: [`acc-${index + 1}`] },
              },
            },
          }),
        });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/overview']}>
        <Link to="/reports">Reports</Link>
        <FloatingAiAssistant />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));

    for (const [index, question] of ['What is the runway?', 'What is working capital?'].entries()) {
      const input = screen.getByPlaceholderText(/Ask a question about your cash flow/i);
      fireEvent.change(input, { target: { value: question } });
      const form = input.closest('form');
      if (!form) throw new Error('Chat form was not rendered');
      fireEvent.submit(form);
      await screen.findByText(answers[index]);
    }

    expect(screen.getByText(answers[0])).toBeInTheDocument();
    expect(screen.getByText(answers[1])).toBeInTheDocument();
    expect(screen.queryByText(/Verified across/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/specialist agent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Audit references/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close AI Finance Assistant chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));
    expect(screen.getByText(answers[0])).toBeInTheDocument();
    expect(screen.getByText(answers[1])).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat to full screen' }));
    expect(screen.getByRole('dialog')).toHaveClass('assistant-chat-panel--expanded');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'AI Finance Assistant chat panel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));
    expect(screen.getByRole('dialog')).not.toHaveClass('assistant-chat-panel--expanded');

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat to full screen' }));
    expect(screen.getByRole('dialog')).toHaveClass('assistant-chat-panel--expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Restore chat size' }));
    expect(screen.getByRole('dialog')).not.toHaveClass('assistant-chat-panel--expanded');

    fireEvent.click(screen.getByRole('button', { name: 'Close AI Finance Assistant chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Finance Assistant chat' }));
    fireEvent.click(screen.getByRole('link', { name: 'Reports' }));
    const messages = screen
      .getAllByTestId('chat-message')
      .map((message) => message.textContent ?? '');
    expect(messages.findIndex((message) => message.includes(answers[0]))).toBeLessThan(
      messages.findIndex((message) => message.includes(answers[1])),
    );

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText(answers[0])).not.toBeInTheDocument();
    expect(screen.queryByText(answers[1])).not.toBeInTheDocument();
    expect(screen.getByText(/Hello! I am your AI Finance Assistant/)).toBeInTheDocument();
  });
});

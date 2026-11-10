import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { AiAssistantPage } from './AiAssistantPage';

describe('AiAssistantPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chat interface with suggested queries and handles question asking', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'analyst@apex.local',
        fullName: 'Financial Analyst',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCIAL_ANALYST,
      },
      memberships: [],
      activeRole: RoleType.FINANCIAL_ANALYST,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: {
          answer:
            'Based on your trailing 90-day burn rate of $12,500/mo and $100,000 liquid cash, your runway is 8.0 months.',
          citations: ['tx-100', 'tx-101'],
          formulaVersion: 'v1.0.0-decimal',
          latencyMs: 142,
        },
      }),
    });

    render(<AiAssistantPage />);

    expect(screen.getByText('AI Finance Assistant')).toBeInTheDocument();
    expect(screen.getByText('Grounded Reasoning')).toBeInTheDocument();
    expect(screen.getByText('What is our current cash runway in months?')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask a question about your cash flow/i);
    fireEvent.change(input, { target: { value: 'What is our runway?' } });

    const submitBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Based on your trailing 90-day burn rate of \$12,500\/mo/i),
      ).toBeInTheDocument();
    });
  });
});

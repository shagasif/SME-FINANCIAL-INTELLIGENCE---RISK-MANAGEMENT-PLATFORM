import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { ApiClientError } from '../../services/apiClient';
import { RoleType } from '../../types/auth.types';
import { LoginPage } from './LoginPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: { from: { pathname: '/overview' } } }),
  };
});

describe('LoginPage Component', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      activeOrg: null,
      memberships: [],
      activeRole: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => false,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });
  });

  it('renders login form with accessible inputs and branding', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    expect(screen.getByLabelText(/Work Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
  });

  it('autofills verified test credentials when an authorized demo role is selected', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const financeManagerButton = screen.getByRole('button', {
      name: /Finance Manager/i,
    });
    fireEvent.click(financeManagerButton);

    const emailInput = screen.getByLabelText(/Work Email Address/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;

    expect(emailInput.value).toBe('finance@apex.local');
    expect(passwordInput.value).toBe('Password123!');
  });

  it('calls login with credentials and navigates on success', async () => {
    mockLogin.mockResolvedValueOnce({
      accessToken: 'test-token',
      expiresIn: 3600,
      user: {
        id: 'usr-1',
        email: 'owner@apex.local',
        fullName: 'Jane Owner',
        isPlatformAdmin: false,
      },
      organization: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
    });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/Work Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });

    fireEvent.change(emailInput, { target: { value: 'owner@apex.local' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        { email: 'owner@apex.local', password: 'Password123!' },
        true,
      );
      expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true });
    });
  });

  it('displays error alert on 401 invalid credentials', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiClientError('Invalid email or password', 401, {
        message: 'Invalid email or password',
        statusCode: 401,
        error: 'Unauthorized',
      }),
    );

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/Work Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });

    fireEvent.change(emailInput, { target: { value: 'invalid@apex.local' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Invalid email or password. Please verify your credentials./i,
      );
    });
  });
});

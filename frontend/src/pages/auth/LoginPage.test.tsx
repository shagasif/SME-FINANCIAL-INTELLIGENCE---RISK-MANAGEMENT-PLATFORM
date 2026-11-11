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
    expect(screen.getByLabelText(/^Password$/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/Forgot password\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Register organization/i)).toBeInTheDocument();
  });

  it('does not display any demo account selectors, preset credentials, or autofill buttons', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    // Verify absence of demo panel and credentials
    expect(screen.queryByText(/Authorized Demo Accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText('owner@apex.local')).not.toBeInTheDocument();
    expect(screen.queryByText('finance@apex.local')).not.toBeInTheDocument();
    expect(screen.queryByText('accountant@apex.local')).not.toBeInTheDocument();
    expect(screen.queryByText('Password123!')).not.toBeInTheDocument();
  });

  it('calls login with credentials and navigates on success', async () => {
    mockLogin.mockResolvedValueOnce({
      accessToken: 'test-token',
      expiresIn: 3600,
      user: {
        id: 'usr-1',
        email: 'realuser@enterprise.com',
        fullName: 'Real User',
        isPlatformAdmin: false,
      },
      organization: {
        id: 'org-1',
        name: 'Enterprise Holdings',
        slug: 'enterprise-holdings',
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
    const passwordInput = screen.getByLabelText(/^Password$/i, { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });

    fireEvent.change(emailInput, { target: { value: 'realuser@enterprise.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        { email: 'realuser@enterprise.com', password: 'SecurePass123!' },
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
    const passwordInput = screen.getByLabelText(/^Password$/i, { selector: 'input' });
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

  it('toggles password visibility when clicking the eye button without changing its value', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(/^Password$/i, { selector: 'input' }) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.change(passwordInput, { target: { value: 'SecretPassword123!' } });
    expect(passwordInput.value).toBe('SecretPassword123!');

    const toggleBtn = screen.getByRole('button', { name: /Show password/i });
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe('text');
    expect(passwordInput.value).toBe('SecretPassword123!');

    const hideBtn = screen.getByRole('button', { name: /Hide password/i });
    fireEvent.click(hideBtn);

    expect(passwordInput.type).toBe('password');
    expect(passwordInput.value).toBe('SecretPassword123!');
  });
});

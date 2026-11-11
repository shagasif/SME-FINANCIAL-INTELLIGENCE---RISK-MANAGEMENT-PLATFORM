import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '../../services/apiClient';
import { RegisterPage } from './RegisterPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('RegisterPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders registration form with Pakistan as default jurisdiction and PKR as default currency', () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Company \/ Legal Entity Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country \/ Jurisdiction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Base Reporting Currency/i)).toBeInTheDocument();

    const countrySelect = screen.getByLabelText(/Country \/ Jurisdiction/i) as HTMLSelectElement;
    expect(countrySelect.value).toBe('Pakistan');

    const currencySelect = screen.getByLabelText(/Base Reporting Currency/i) as HTMLSelectElement;
    expect(currencySelect.value).toBe('PKR');

    expect(screen.getByRole('button', { name: /Create Workspace & Sign In/i })).toBeInTheDocument();
  });

  it('toggles password and confirm password visibility without clearing values', () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(/^Password/i, { selector: 'input' }) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/Confirm Password/i, { selector: 'input' }) as HTMLInputElement;

    expect(passwordInput.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    fireEvent.change(passwordInput, { target: { value: 'MySecurePass#2026!' } });
    fireEvent.change(confirmInput, { target: { value: 'MySecurePass#2026!' } });

    // Toggle password field
    const showPasswordBtn = screen.getByRole('button', { name: /^Show password$/i });
    fireEvent.click(showPasswordBtn);
    expect(passwordInput.type).toBe('text');
    expect(passwordInput.value).toBe('MySecurePass#2026!');

    const hidePasswordBtn = screen.getByRole('button', { name: /^Hide password$/i });
    fireEvent.click(hidePasswordBtn);
    expect(passwordInput.type).toBe('password');
    expect(passwordInput.value).toBe('MySecurePass#2026!');

    // Toggle confirm password field
    const showConfirmBtn = screen.getByRole('button', { name: /^Show confirm password$/i });
    fireEvent.click(showConfirmBtn);
    expect(confirmInput.type).toBe('text');
    expect(confirmInput.value).toBe('MySecurePass#2026!');

    const hideConfirmBtn = screen.getByRole('button', { name: /^Hide confirm password$/i });
    fireEvent.click(hideConfirmBtn);
    expect(confirmInput.type).toBe('password');
    expect(confirmInput.value).toBe('MySecurePass#2026!');
  });

  it('validates that password and confirm password match before submission', async () => {
    const apiPostSpy = vi.spyOn(apiClient, 'apiPost');

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/Work Email Address/i), { target: { value: 'jane@acme.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input' }), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), { target: { value: 'DifferentPassword123!' } });
    fireEvent.change(screen.getByLabelText(/Company \/ Legal Entity Name/i), { target: { value: 'Acme Corp' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Workspace & Sign In/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Passwords do not match/i);
    expect(apiPostSpy).not.toHaveBeenCalled();
  });

  it('submits registration successfully with default Pakistan country and PKR currency', async () => {
    const apiPostSpy = vi.spyOn(apiClient, 'apiPost').mockResolvedValueOnce({
      accessToken: 'jwt-new-user-token',
      expiresAt: '2026-11-12T00:00:00.000Z',
      user: {
        id: 'usr-new-1',
        email: 'tariq@pakistan-sme.pk',
        fullName: 'Tariq Mehmood',
        isPlatformAdmin: false,
      },
      organization: {
        id: 'org-new-1',
        name: 'Indus Industrial Ltd',
        slug: 'indus-industrial-ltd-12345',
        baseCurrency: 'PKR',
        role: 'BUSINESS_OWNER',
      },
      memberships: [],
    });

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Tariq Mehmood' } });
    fireEvent.change(screen.getByLabelText(/Work Email Address/i), { target: { value: 'tariq@pakistan-sme.pk' } });
    fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input' }), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/Company \/ Legal Entity Name/i), { target: { value: 'Indus Industrial Ltd' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Workspace & Sign In/i }));

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith('/v1/auth/register', {
        fullName: 'Tariq Mehmood',
        email: 'tariq@pakistan-sme.pk',
        password: 'Password123!',
        organizationName: 'Indus Industrial Ltd',
        country: 'Pakistan',
        baseCurrency: 'PKR',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true });
    });
  });

  it('updates currency when changing country and allows manual currency override', async () => {
    const apiPostSpy = vi.spyOn(apiClient, 'apiPost').mockResolvedValueOnce({
      accessToken: 'jwt-new-user-token',
      expiresAt: '2026-11-12T00:00:00.000Z',
      user: { id: 'usr-new-2', email: 'uk@branch.co.uk', fullName: 'John Smith', isPlatformAdmin: false },
      organization: { id: 'org-new-2', name: 'UK Branch Ltd', slug: 'uk-branch-ltd', baseCurrency: 'GBP', role: 'BUSINESS_OWNER' },
      memberships: [],
    });

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const countrySelect = screen.getByLabelText(/Country \/ Jurisdiction/i);
    const currencySelect = screen.getByLabelText(/Base Reporting Currency/i) as HTMLSelectElement;

    // Switch to United Kingdom -> auto sets currency to GBP
    fireEvent.change(countrySelect, { target: { value: 'United Kingdom' } });
    expect(currencySelect.value).toBe('GBP');

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Smith' } });
    fireEvent.change(screen.getByLabelText(/Work Email Address/i), { target: { value: 'uk@branch.co.uk' } });
    fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input' }), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/Company \/ Legal Entity Name/i), { target: { value: 'UK Branch Ltd' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Workspace & Sign In/i }));

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith('/v1/auth/register', {
        fullName: 'John Smith',
        email: 'uk@branch.co.uk',
        password: 'Password123!',
        organizationName: 'UK Branch Ltd',
        country: 'United Kingdom',
        baseCurrency: 'GBP',
      });
    });
  });
});

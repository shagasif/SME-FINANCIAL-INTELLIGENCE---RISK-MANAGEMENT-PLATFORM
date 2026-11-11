import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiDelete, apiGet, apiPatch, apiPost, authStorage } from './apiClient';

describe('apiClient HTTP Service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    authStorage.clearToken();
    authStorage.clearActiveOrgId();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('attaches Bearer token and X-Organization-Id when set', async () => {
    authStorage.setToken('test-jwt-token');
    authStorage.setActiveOrgId('test-org-123');

    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = init.headers;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: true }),
      });
    });

    const data = await apiGet<{ success: boolean }>('/test-route');
    expect(data.success).toBe(true);

    const headers = capturedHeaders as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-jwt-token');
    expect(headers['X-Organization-Id']).toBe('test-org-123');
  });

  it('handles POST and PATCH with json payloads', async () => {
    let capturedMethod = '';
    let capturedBody = '';

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedMethod = init.method;
      capturedBody = init.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ received: true }),
      });
    });

    const postRes = await apiPost<{ received: boolean }>('/create', { name: 'Acme' });
    expect(postRes.received).toBe(true);
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual({ name: 'Acme' });

    await apiPatch('/update', { name: 'Acme Corp' });
    expect(capturedMethod).toBe('PATCH');
    expect(JSON.parse(capturedBody)).toEqual({ name: 'Acme Corp' });
  });

  it('handles DELETE request', async () => {
    let capturedMethod = '';
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedMethod = init.method;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ deleted: true }),
      });
    });

    const res = await apiDelete<{ deleted: boolean }>('/delete/123');
    expect(res.deleted).toBe(true);
    expect(capturedMethod).toBe('DELETE');
  });

  it('throws ApiClientError with backend error message on non-200 responses', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            statusCode: 403,
            error: 'FORBIDDEN',
            message: 'Insufficient role permissions',
          }),
      });
    });

    await expect(apiGet('/forbidden-route')).rejects.toThrow('Insufficient role permissions');
  });

  it('clears token and triggers unauthorized callback on 401', async () => {
    authStorage.setToken('expired-token');
    const unauthorizedSpy = vi.fn();
    authStorage.registerUnauthorizedHandler(unauthorizedSpy);

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ statusCode: 401, message: 'Session expired' }),
      });
    });

    await expect(apiGet('/secure-route')).rejects.toThrow(ApiClientError);
    expect(authStorage.getToken()).toBeNull();
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
  });

  it('persists and retrieves serialized active organization data synchronously', () => {
    const orgData = {
      id: 'org-456',
      name: 'Star Logistics Ltd',
      slug: 'star-logistics',
      baseCurrency: 'PKR',
      role: 'BUSINESS_OWNER',
    };

    authStorage.setActiveOrg(orgData);
    expect(authStorage.getActiveOrgId()).toBe('org-456');
    expect(authStorage.getActiveOrg()).toEqual(orgData);

    authStorage.clearActiveOrgId();
    expect(authStorage.getActiveOrgId()).toBeNull();
    expect(authStorage.getActiveOrg()).toBeNull();
  });

  it('clears active organization data when clearToken is invoked', () => {
    authStorage.setToken('sample-token');
    authStorage.setActiveOrg({ id: 'org-789', name: 'Alpha Ltd' });

    expect(authStorage.getToken()).toBe('sample-token');
    expect(authStorage.getActiveOrgId()).toBe('org-789');

    authStorage.clearToken();
    expect(authStorage.getToken()).toBeNull();
    expect(authStorage.getActiveOrgId()).toBeNull();
    expect(authStorage.getActiveOrg()).toBeNull();
  });
});

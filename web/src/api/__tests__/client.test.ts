import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../client';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('api client', () => {
  it('adds Authorization header when JWT token exists in localStorage', async () => {
    localStorage.setItem('jwt_token', 'my-token');
    mockFetch.mockReturnValue(jsonResponse({ id: 1 }));

    await api.get('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer my-token' },
      body: undefined,
    });
  });

  it('does not add Authorization header when no token', async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 1 }));

    await api.get('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'GET',
      headers: {},
      body: undefined,
    });
  });

  it('returns undefined for 204 No Content responses', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('no body')),
      }),
    );

    const result = await api.del('/api/items/1');

    expect(result).toBeUndefined();
  });

  it('throws ApiError for non-2xx responses with error body', async () => {
    mockFetch.mockReturnValue(
      jsonResponse(
        { code: 'NOT_FOUND', message: 'not found', details: { id: 'invalid' } },
        404,
      ),
    );

    await expect(api.get('/api/missing')).rejects.toThrow(ApiError);

    try {
      await api.get('/api/missing');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.details).toEqual({ id: 'invalid' });
    }
  });

  it('buildQuery filters out undefined and empty string params', () => {
    const qs = api.buildQuery({
      name: 'test',
      empty: '',
      missing: undefined,
      flag: true,
      count: 5,
    });

    expect(qs).toContain('name=test');
    expect(qs).toContain('flag=true');
    expect(qs).toContain('count=5');
    expect(qs).not.toContain('empty');
    expect(qs).not.toContain('missing');
  });
});

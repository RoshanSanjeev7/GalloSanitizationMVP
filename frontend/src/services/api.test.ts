import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- helpers ----------------------------------------------------------------

function mockFetchResponse(status: number, body: unknown = null, headers: Record<string, string> = {}) {
  const headersMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headersMap.get(key.toLowerCase()) ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// --- setup ------------------------------------------------------------------

let api: typeof import('./api').default;

beforeEach(async () => {
  // Reset fetch mock before each test
  global.fetch = vi.fn();

  // Re-import the module fresh so it picks up the clean localStorage
  // (vitest module cache is reset between describe blocks, but we also
  //  use dynamic import to be safe)
  const mod = await import('./api');
  api = mod.default;
});

// --- tests ------------------------------------------------------------------

describe('request() — Authorization header', () => {
  it('includes Authorization header when a token exists in localStorage', async () => {
    localStorage.setItem('token', 'test-jwt-token');
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, { ok: true }, { 'content-type': 'application/json' }) as any,
    );

    await api.getMe(); // calls request('/auth/me')

    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    expect((init!.headers as Record<string, string>)['Authorization']).toBe('Bearer test-jwt-token');
  });

  it('omits Authorization header when no token in localStorage', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, { ok: true }, { 'content-type': 'application/json' }) as any,
    );

    await api.getMe();

    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    expect((init!.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});

describe('request() — status handling', () => {
  it('returns null for 204 No Content responses', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(mockFetchResponse(204) as any);

    const result = await api.deleteUser('user-1');
    expect(result).toBeUndefined(); // deleteUser calls request and returns void
  });

  it('clears localStorage and redirects to /login on 401', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('user', JSON.stringify({ id: '1' }));

    // Set pathname so the redirect guard passes
    (window.location as any).pathname = '/dashboard';

    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(401, { error: 'Unauthorized' }, { 'content-type': 'application/json' }) as any,
    );

    await expect(api.getMe()).rejects.toThrow();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('throws Error with message from response body on non-ok status', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(400, { error: 'Bad input data' }, { 'content-type': 'application/json' }) as any,
    );

    await expect(api.getMe()).rejects.toThrow('Bad input data');
  });
});

describe('login()', () => {
  it('stores user and token in localStorage on successful login', async () => {
    const fakeUser = { id: 'u1', name: 'Test', email: 'test@gallo.com', role: 'operator' };
    const fakeResponse = { user: fakeUser, token: 'jwt-abc' };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, fakeResponse, { 'content-type': 'application/json' }) as any,
    );

    const data = await api.login('test@gallo.com', 'pass123');

    expect(data.user).toEqual(fakeUser);
    expect(data.token).toBe('jwt-abc');
    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(fakeUser);
  });
});

describe('logout()', () => {
  it('removes user and token from localStorage', () => {
    localStorage.setItem('token', 'some-token');
    localStorage.setItem('user', JSON.stringify({ id: '1' }));

    api.logout();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('getChecklists()', () => {
  it('constructs correct URL when params are provided', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, [], { 'content-type': 'application/json' }) as any,
    );

    await api.getChecklists({ status: 'submitted', lineId: 'line-1' });

    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('/api/checklists?status=submitted&lineId=line-1');
  });

  it('calls /api/checklists without query string when no params', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, [], { 'content-type': 'application/json' }) as any,
    );

    await api.getChecklists();

    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('/api/checklists');
  });
});

describe('retry logic for GET requests', () => {
  it('retries GET request on 500 error and succeeds on second attempt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse(500, { error: 'Server Error' }, { 'content-type': 'application/json' }) as any,
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, { items: [], total: 0, hasMore: false }, { 'content-type': 'application/json' }) as any,
      );

    const promise = api.getChecklists();
    // Advance past retry delay
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ items: [], total: 0, hasMore: false });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry on 400 client error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(400, { error: 'Bad request' }, { 'content-type': 'application/json' }) as any,
    );

    await expect(api.getChecklists()).rejects.toThrow('Bad request');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry POST/PUT/DELETE requests', async () => {
    localStorage.setItem('token', 'test-token');
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(500, { error: 'Server Error' }, { 'content-type': 'application/json' }) as any,
    );

    await expect(api.submitChecklist('cl-1')).rejects.toThrow('Server Error');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('uploadImages()', () => {
  it('uses FormData and does NOT set Content-Type header', async () => {
    localStorage.setItem('token', 'upload-token');

    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse(200, { images: ['img1.jpg'] }, { 'content-type': 'application/json' }) as any,
    );

    const fakeFile = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });
    await api.uploadImages('cl-1', 0, 1, 2, [fakeFile]);

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];

    expect(url).toBe('/api/checklists/cl-1/images');
    expect(init!.method).toBe('POST');

    // Body should be FormData (browser handles Content-Type with boundary)
    expect(init!.body).toBeInstanceOf(FormData);

    // Headers must NOT include Content-Type (the browser sets it for multipart)
    const headers = init!.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();

    // Authorization should still be present
    expect(headers['Authorization']).toBe('Bearer upload-token');
  });
});

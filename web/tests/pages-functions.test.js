import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/config.js';
import { onRequestPost } from '../functions/api/delete-account.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Pages config endpoint', () => {
  it('returns only public Supabase configuration', async () => {
    const response = await onRequestGet({
      env: {
        SUPABASE_URL: 'https://example.supabase.co/',
        SUPABASE_ANON_KEY: 'public-key',
        SUPABASE_SERVICE_ROLE_KEY: 'private-key',
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-key',
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('reports missing deployment configuration', async () => {
    const response = await onRequestGet({ env: {} });
    assert.equal(response.status, 503);
  });
});

describe('Account deletion endpoint', () => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'private-key',
  };

  it('requires an access token before contacting Supabase', async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch must not be called');
    };

    const response = await onRequestPost({
      request: new Request('https://parabu.example/api/delete-account', { method: 'POST' }),
      env,
    });

    assert.equal(response.status, 401);
  });

  it('validates the session and uses the secret only for admin deletion', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return requests.length === 1
        ? Response.json({ id: '01234567-89ab-cdef-0123-456789abcdef' })
        : new Response(null, { status: 204 });
    };

    const response = await onRequestPost({
      request: new Request('https://parabu.example/api/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-access-token' },
      }),
      env,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer user-access-token');
    assert.equal(requests[1].options.headers.Authorization, 'Bearer private-key');
    assert.equal(requests[1].options.method, 'DELETE');
  });

  it('does not report success when the admin deletion fails', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ id: '01234567-89ab-cdef-0123-456789abcdef' })
        : Response.json({ message: 'private provider detail' }, { status: 500 });
    };

    const response = await onRequestPost({
      request: new Request('https://parabu.example/api/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-access-token' },
      }),
      env,
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: 'Hesap silinemedi. Lütfen daha sonra tekrar deneyin.',
    });
  });
});

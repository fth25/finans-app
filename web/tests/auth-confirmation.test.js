import { it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const storage = new Map();
const calls = [];
let currentUrl = new URL('https://parabu.pages.dev/');
const userId = '01234567-89ab-cdef-0123-456789abcdef';
const accessToken =
  `header.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64url')}.signature`;
const historyUpdates = [];

globalThis.window = {};
globalThis.location = {
  get hostname() { return currentUrl.hostname; },
  get origin() { return currentUrl.origin; },
  get href() { return currentUrl.href; },
  get search() { return currentUrl.search; },
  get hash() { return currentUrl.hash; },
};
globalThis.history = {
  replaceState(_state, _title, url) {
    historyUpdates.push(url);
    currentUrl = new URL(url, currentUrl);
  },
};
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  calls.push({ url, options });

  if (url === '/api/config') {
    return Response.json({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-key',
    });
  }
  if (url.includes('/auth/v1/signup')) {
    return Response.json({ user: { id: userId, email: 'person@example.invalid' } });
  }
  if (url.endsWith('/auth/v1/verify')) {
    return Response.json({
      access_token: accessToken,
      refresh_token: 'verified-refresh',
    });
  }
  if (url.endsWith('/auth/v1/user')) {
    return Response.json({ id: userId, email: 'person@example.invalid' });
  }
  throw new Error(`Unexpected request: ${url}`);
};

it('preserves local state for email-confirmed signups and consumes verification links', async () => {
  try {
    await import('../js/api.js?signup-test');
    const signUpResult = await window.API.register('person@example.invalid', 'test-pass-123');
    assert.equal(signUpResult.confirmationRequired, true);
    assert.equal(signUpResult.user.id, userId);
    assert.equal(window.API.getToken(), null);

    currentUrl = new URL(
      'https://parabu.pages.dev/?token_hash=confirmation-hash&type=signup'
    );
    await import('../js/api.js?callback-test');
    assert.equal(window.API.hasToken(), true);

    const me = await window.API.me();
    assert.equal(me.user.id, userId);
    assert.equal(window.API.getToken(), accessToken);
    assert.ok(calls.some(call =>
      call.url.endsWith('/auth/v1/verify') &&
      JSON.parse(call.options.body).token_hash === 'confirmation-hash'
    ));
    assert.equal(historyUpdates.at(-1), '/');
  } finally {
    window.API?.setToken(null);
    globalThis.fetch = originalFetch;
  }
});

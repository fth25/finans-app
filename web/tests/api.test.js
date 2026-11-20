import { it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const userId = '01234567-89ab-cdef-0123-456789abcdef';
const tokenFor = id =>
  `header.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.signature`;
const initialToken = tokenFor(userId);
const refreshedToken = `new.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64url')}.signature`;
const storage = new Map();
const calls = [];
let rejectFirstUserRequest = true;

globalThis.window = {};
globalThis.location = {
  hostname: 'parabu.pages.dev',
  origin: 'https://parabu.pages.dev',
  href: 'https://parabu.pages.dev/',
  search: '',
  hash: '',
};
globalThis.history = { replaceState() {} };
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  const method = options.method || 'GET';
  calls.push({ url, method, headers: options.headers || {}, body: options.body });

  if (url === '/api/config') {
    return Response.json({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-key',
    });
  }
  if (url.endsWith('/auth/v1/signup?redirect_to=https%3A%2F%2Fparabu.pages.dev%2F')) {
    return Response.json({
      access_token: initialToken,
      refresh_token: 'initial-refresh',
      user: { id: userId, email: 'person@example.invalid' },
    });
  }
  if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
    return Response.json({
      access_token: refreshedToken,
      refresh_token: 'new-refresh',
    });
  }
  if (url.endsWith('/auth/v1/user')) {
    if (rejectFirstUserRequest) {
      rejectFirstUserRequest = false;
      return Response.json({ message: 'expired' }, { status: 401 });
    }
    return Response.json({ id: userId, email: 'person@example.invalid' });
  }
  if (url.includes('/rest/v1/user_states') && method === 'GET') {
    return Response.json([]);
  }
  if (url.includes('/rest/v1/user_states') && method === 'POST') {
    return new Response(null, { status: 204 });
  }
  if (url === '/api/delete-account' && method === 'POST') {
    return Response.json({ ok: true });
  }
  if (url.endsWith('/auth/v1/logout?scope=local')) {
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

await import('../js/api.js');
const API = window.API;

it('uses Supabase Auth, refreshes sessions, and stores state through the RLS API', async () => {
  try {
    const session = await API.register('person@example.invalid', 'test-pass-123');
    assert.equal(session.token, initialToken);
    API.setToken(session.token, session.refreshToken);

    const me = await API.me();
    assert.equal(me.user.id, userId);
    assert.equal(API.getToken(), refreshedToken);

    const state = await API.getState();
    assert.deepEqual(state, { data: {}, updated_at: null });
    await API.putState({ transactions: [] });
    await API.deleteMe();
    await API.logout();

    const stateWrite = calls.find(call =>
      call.url.includes('/rest/v1/user_states') && call.method === 'POST'
    );
    assert.ok(stateWrite);
    assert.equal(JSON.parse(stateWrite.body).user_id, userId);
    assert.ok(calls.some(call =>
      call.url.endsWith('/auth/v1/token?grant_type=refresh_token')
    ));
    assert.ok(calls.some(call => call.url === '/api/delete-account'));
  } finally {
    API.setToken(null);
    globalThis.fetch = originalFetch;
  }
});

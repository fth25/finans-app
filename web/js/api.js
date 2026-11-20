(function () {
  const TOKEN_KEY = 'finansapp_token';
  const REFRESH_TOKEN_KEY = 'parabu_supabase_refresh_token';
  let configPromise;
  let localMode = false;
  let callbackHandled = false;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token, refreshToken) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);

    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  function hasAuthCallback() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    return query.has('token_hash') || hash.has('access_token');
  }

  async function getConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/config', { cache: 'no-store' }).then(async response => {
        if (
          response.status === 404 &&
          ['localhost', '127.0.0.1'].includes(location.hostname)
        ) {
          localMode = true;
          return null;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Supabase ayarları yüklenemedi.');
        if (!data.supabaseUrl || !data.supabaseAnonKey) {
          throw new Error('Supabase bağlantı ayarları eksik.');
        }
        return {
          url: data.supabaseUrl.replace(/\/+$/, ''),
          anonKey: data.supabaseAnonKey,
        };
      });
    }
    return configPromise;
  }

  async function readResponse(response) {
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!response.ok) {
      const message =
        data.error_description ||
        data.msg ||
        data.message ||
        data.error ||
        'İstek başarısız.';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function legacyRequest(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api${path}`, { ...options, headers });
    return readResponse(response);
  }

  function authHeaders(config, token) {
    const headers = { apikey: config.anonKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function authRequest(config, path, body) {
    const response = await fetch(`${config.url}/auth/v1${path}`, {
      method: 'POST',
      headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return readResponse(response);
  }

  function storeSession(session) {
    if (session?.access_token) setToken(session.access_token, session.refresh_token);
  }

  async function completeAuthCallback(config) {
    if (callbackHandled) return;
    callbackHandled = true;

    const url = new URL(location.href);
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    if (tokenHash && type) {
      const session = await authRequest(config, '/verify', {
        token_hash: tokenHash,
        type,
      });
      storeSession(session);
      url.searchParams.delete('token_hash');
      url.searchParams.delete('type');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }

    const hash = new URLSearchParams(url.hash.slice(1));
    const accessToken = hash.get('access_token');
    if (accessToken) {
      setToken(accessToken, hash.get('refresh_token'));
      history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }

  async function refreshSession(config) {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const session = await authRequest(config, '/token?grant_type=refresh_token', {
        refresh_token: refreshToken,
      });
      storeSession(session);
      return session.access_token;
    } catch (error) {
      if (error.status === 400 || error.status === 401) {
        setToken(null);
        return null;
      }
      throw error;
    }
  }

  async function authenticatedFetch(config, url, options = {}) {
    const token = getToken();
    if (!token) throw new Error('Oturum açmanız gerekiyor.');

    const send = currentToken =>
      fetch(url, {
        ...options,
        headers: {
          ...authHeaders(config, currentToken),
          ...(options.headers || {}),
        },
      });

    let response = await send(token);
    if (response.status === 401) {
      const refreshedToken = await refreshSession(config);
      if (refreshedToken) response = await send(refreshedToken);
    }
    return response;
  }

  function getUserIdFromToken(token) {
    try {
      const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
      const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      return typeof payload.sub === 'string' &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(payload.sub)
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }

  async function readyConfig() {
    const config = await getConfig();
    if (config) await completeAuthCallback(config);
    return config;
  }

  window.API = {
    getToken,
    setToken,
    hasToken: () => Boolean(getToken() || hasAuthCallback()),
    register: async (email, password) => {
      const config = await readyConfig();
      if (!config) {
        return legacyRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      }
      const redirectTo = encodeURIComponent(`${location.origin}/`);
      const result = await authRequest(
        config,
        `/signup?redirect_to=${redirectTo}`,
        { email: email.trim(), password }
      );
      if (!result.access_token) {
        return { confirmationRequired: true, user: result.user };
      }
      return {
        token: result.access_token,
        refreshToken: result.refresh_token,
        user: result.user,
      };
    },
    login: async (email, password) => {
      const config = await readyConfig();
      if (!config) {
        return legacyRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      }
      const session = await authRequest(config, '/token?grant_type=password', {
        email: email.trim(),
        password,
      });
      return {
        token: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      };
    },
    me: async () => {
      const config = await readyConfig();
      if (!config) return legacyRequest('/auth/me');
      const response = await authenticatedFetch(
        config,
        `${config.url}/auth/v1/user`
      );
      return { user: await readResponse(response) };
    },
    logout: async () => {
      const token = getToken();
      if (!token) return;
      const config = await getConfig();
      if (!config) return;
      const response = await fetch(`${config.url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: authHeaders(config, token),
      });
      if (!response.ok && response.status !== 401) {
        await readResponse(response);
      }
    },
    deleteMe: async () => {
      const config = await readyConfig();
      if (!config) return legacyRequest('/auth/me', { method: 'DELETE' });
      const response = await authenticatedFetch(config, '/api/delete-account', {
        method: 'POST',
      });
      return readResponse(response);
    },
    getState: async () => {
      const config = await readyConfig();
      if (!config) return legacyRequest('/state');
      const response = await authenticatedFetch(
        config,
        `${config.url}/rest/v1/user_states?select=data,updated_at&limit=1`
      );
      const rows = await readResponse(response);
      return rows.length
        ? rows[0]
        : { data: {}, updated_at: null };
    },
    putState: async data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Kaydedilecek veri biçimi geçersiz.');
      }
      const serialized = JSON.stringify(data);
      if (new TextEncoder().encode(serialized).length > 4 * 1024 * 1024) {
        throw new Error('Buluta kaydedilecek veri boyutu çok büyük.');
      }

      const config = await readyConfig();
      if (!config) {
        return legacyRequest('/state', {
          method: 'PUT',
          body: JSON.stringify({ data }),
        });
      }
      const userId = getUserIdFromToken(getToken() || '');
      if (!userId) throw new Error('Oturum bilgisi geçersiz. Yeniden giriş yapın.');

      const response = await authenticatedFetch(
        config,
        `${config.url}/rest/v1/user_states?on_conflict=user_id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            user_id: userId,
            data,
            updated_at: new Date().toISOString(),
          }),
        }
      );
      return readResponse(response);
    },
    health: async () => {
      try {
        const config = await getConfig();
        if (config) return true;
        return fetch('/api/health').then(response => response.ok).catch(() => false);
      } catch {
        return false;
      }
    },
  };
})();

const TOKEN_KEY = 'kgga_auth_token';
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function headers(includeJson = false): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...headers(options.body !== undefined),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw Object.assign(
      new Error(typeof data === 'string' ? data : data?.message || `Request failed (${response.status})`),
      { status: response.status },
    );
  }
  return { data };
}

async function authenticate(path: string, email: string, password: string) {
  const r = await request(path, { method: 'POST', body: JSON.stringify({ email, password }) });
  localStorage.setItem(TOKEN_KEY, r.data.token);
}

export const auth = {
  isSignedIn: () => Boolean(localStorage.getItem(TOKEN_KEY)),
  signIn: (email: string, password: string) => authenticate('/api/auth/login', email, password),
  register: (email: string, password: string) => authenticate('/api/auth/register', email, password),
  async signOut() {
    try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* token is dropped below regardless */ }
    localStorage.removeItem(TOKEN_KEY);
  },
};

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body: unknown) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: unknown) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

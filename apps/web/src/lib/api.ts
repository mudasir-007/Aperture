const TOKEN_KEY = 'aperture.token';
const USER_KEY = 'aperture.user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Authenticated fetch against /api/* which the Vite dev server proxies
 * to the backend. Uses same-origin requests — no CORS in development.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (!res.ok) {
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error
    }
    const requestId = res.headers.get('X-Request-Id') ?? undefined;
    throw new ApiError(
      res.status,
      body.error ?? body.message ?? `Request failed (${res.status})`,
      requestId
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
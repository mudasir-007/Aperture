import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, AuthResponse } from '../api/client';

interface AuthState {
  token: string | null;
  user: AuthResponse['user'] | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; organizationName: string }) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'rag-chat-auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadPersisted(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    return JSON.parse(raw) as AuthState;
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadPersisted);

  useEffect(() => {
    if (state.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async login(email, password) {
        const result = await api.login({ email, password });
        setState({ token: result.token, user: result.user });
      },
      async register(input) {
        const result = await api.register(input);
        setState({ token: result.token, user: result.user });
      },
      logout() {
        setState({ token: null, user: null });
      }
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

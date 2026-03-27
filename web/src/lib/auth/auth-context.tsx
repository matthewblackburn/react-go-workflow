import type { QueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

interface DecodedToken {
  sub: number;
  roles: string[];
  exp: number;
}

function decodeToken(token: string): DecodedToken | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

interface AuthContextValue {
  token: string | null;
  claims: DecodedToken | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('jwt_token'));
  const [claims, setClaims] = useState<DecodedToken | null>(() => {
    const t = localStorage.getItem('jwt_token');
    return t ? decodeToken(t) : null;
  });

  const setToken = useCallback(
    (t: string) => {
      localStorage.setItem('jwt_token', t);
      setTokenState(t);
      setClaims(decodeToken(t));
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const clearToken = useCallback(() => {
    localStorage.removeItem('jwt_token');
    setTokenState(null);
    setClaims(null);
    queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ token, claims, setToken, clearToken, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

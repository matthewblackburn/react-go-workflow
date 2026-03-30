import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import Session from 'supertokens-web-js/recipe/session';
import { setOnUnauthorized } from '@/api/client';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = useCallback(async () => {
    const exists = await Session.doesSessionExist();
    setIsAuthenticated(exists);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    setOnUnauthorized(() => {
      setIsAuthenticated(false);
    });
  }, []);

  const signOut = useCallback(async () => {
    await Session.signOut();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, signOut, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

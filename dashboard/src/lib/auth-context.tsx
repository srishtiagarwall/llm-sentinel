import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { authApi, getToken, setToken, clearToken } from './api';
import { disconnectDashboardSocket } from './socket';

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());

  const login = useCallback(async (email: string, password: string) => {
    const { token } = await authApi.login(email, password);
    setToken(token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    disconnectDashboardSocket();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

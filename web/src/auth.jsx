import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out

  const refresh = useCallback(async () => {
    try {
      const r = await api('/auth/me');
      setSession(r.ok ? r.body : null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password, code) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password, ...(code ? { code } : {}) } });
    if (r.ok) setSession(r.body);
    return r;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout, refresh }), [session, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

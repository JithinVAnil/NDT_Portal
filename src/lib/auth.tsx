"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { Role, SessionUser } from "@/types/api";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin/dashboard",
  DEPARTMENT: "/department/dashboard",
  LEARNER: "/learner/dashboard",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<SessionUser>("/auth/me"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: SessionUser }>("/auth/login", {
      body: { email, password },
    });
    setToken(res.access_token);
    // If the login response already contains the user, use it directly.
    // Only fall back to a separate /auth/me call if user is missing from response.
    if (res.user) {
      setUser(res.user);
      return res.user;
    }
    try {
      const me = await api<SessionUser>("/auth/me");
      setUser(me);
      return me;
    } catch {
      setUser(res.user);
      return res.user;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

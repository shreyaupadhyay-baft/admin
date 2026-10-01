import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../api/client.js";
import { fetchCurrentAdmin, login as apiLogin, logout as apiLogout, type CurrentAdmin } from "../api/auth.js";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; admin: CurrentAdmin };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * UX/navigation convenience only. Every protected API call is re-checked by
   * the backend's requirePermission middleware — this never substitutes for it.
   */
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchCurrentAdmin()
      .then((admin) => {
        if (!cancelled) setState({ status: "authenticated", admin });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unauthenticated" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const admin = await apiLogin(email, password);
    setState({ status: "authenticated", admin });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setState({ status: "unauthenticated" });
    }
  }, []);

  const can = useCallback(
    (permission: string) => state.status === "authenticated" && state.admin.permissions.includes(permission),
    [state],
  );

  const value = useMemo(() => ({ state, login, logout, can }), [state, login, logout, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

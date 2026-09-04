"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, Input } from "@/components/ui";

export type PublicUser = {
  id: string;
  username: string;
  status: string;
};

type AuthContextValue = {
  user: PublicUser | null;
  csrfToken: string | null;
  loading: boolean;
  authOpen: boolean;
  openAuth: (mode?: "login" | "register") => void;
  closeAuth: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<{
    user: PublicUser | null;
    csrfToken: string | null;
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const me = useQuery({
    queryKey: ["auth-me"],
    queryFn: () =>
      api<{ user: PublicUser | null; csrfToken: string | null }>("/api/auth/me"),
  });
  const user = override ? override.user : (me.data?.user ?? null);
  const csrfToken = override ? override.csrfToken : (me.data?.csrfToken ?? null);
  const refresh = useCallback(async () => {
    const data = await me.refetch();
    if (data.data) setOverride(null);
  }, [me]);

  async function submit(form: FormData) {
    setError(null);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const data = await api<{ user: PublicUser; csrfToken: string }>(path, {
        method: "POST",
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      setOverride({ user: data.user, csrfToken: data.csrfToken });
      setAuthOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    }
  }

  const value: AuthContextValue = {
    user,
    csrfToken,
    loading: me.isLoading,
    authOpen,
    openAuth: (next = "login") => {
      setMode(next);
      setAuthOpen(true);
    },
    closeAuth: () => setAuthOpen(false),
    refresh,
    logout: async () => {
      if (csrfToken)
        await api("/api/auth/logout", { method: "POST", csrf: csrfToken });
      setOverride({ user: null, csrfToken: null });
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authOpen ? (
        <Dialog
          title={mode === "login" ? "登录" : "注册"}
          onClose={() => setAuthOpen(false)}
        >
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(new FormData(event.currentTarget));
            }}
          >
            <Input
              label="用户名"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
            />
            <Input
              label="密码"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={12}
            />
            {error ? <p className="negative">{error}</p> : null}
            <button type="submit" className="primary-button">
              {mode === "login" ? "登录" : "创建账号"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
            </button>
            <p className="subtle">
              公开注册。首版不提供忘记密码，请自行保管密码。
            </p>
          </form>
        </Dialog>
      ) : null}
    </AuthContext.Provider>
  );
}

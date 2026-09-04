"use client";

import { useState } from "react";
import { useAuth } from "./auth-dialog";
import { api } from "@/lib/api";
import { Dialog, Input } from "@/components/ui";

export function AccountMenu() {
  const { user, csrfToken, openAuth, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user)
    return (
      <button type="button" className="secondary-button" onClick={() => openAuth()}>
        登录
      </button>
    );
  return (
    <>
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        {user.username}
      </button>
      {open ? (
        <Dialog title="账号" onClose={() => setOpen(false)}>
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError(null);
              try {
                await api("/api/auth/change-password", {
                  method: "POST",
                  csrf: csrfToken,
                  body: JSON.stringify({
                    currentPassword: String(form.get("currentPassword") ?? ""),
                    newPassword: String(form.get("newPassword") ?? ""),
                  }),
                });
                await logout();
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "修改失败");
              }
            }}
          >
            <Input
              label="当前密码"
              name="currentPassword"
              type="password"
              required
            />
            <Input
              label="新密码"
              name="newPassword"
              type="password"
              required
              minLength={12}
            />
            {error ? <p className="negative">{error}</p> : null}
            <button type="submit" className="primary-button">
              修改密码并重新登录
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void logout();
                setOpen(false);
              }}
            >
              退出
            </button>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

"use client";

import { Dialog, Input } from "@/components/ui";

export function PasswordConfirmDialog({
  title,
  warning,
  onClose,
  onConfirm,
  error,
}: {
  title: string;
  warning: string;
  onClose: () => void;
  onConfirm: (password: string) => void;
  error?: string | null;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const password = String(new FormData(event.currentTarget).get("password") ?? "");
          onConfirm(password);
        }}
      >
        <p className="warning">{warning}</p>
        <Input
          label="当前账号密码"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error ? <p className="negative">{error}</p> : null}
        <button type="submit" className="primary-button">
          输入密码确认
        </button>
      </form>
    </Dialog>
  );
}

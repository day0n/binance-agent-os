"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-dialog";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const toast = useMemo(() => (value: string) => setMessage(value), []);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={toast}>
        <AuthProvider>
          {children}
          {message ? (
            <div className="toast" role="status">
              <p>{message}</p>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭通知"
                onClick={() => setMessage(null)}
              >
                ×
              </button>
            </div>
          ) : null}
        </AuthProvider>
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}

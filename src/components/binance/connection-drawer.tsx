"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-dialog";
import {
  encryptBinanceCredentials,
  fingerprintApiKey,
} from "./credential-encryption";

export function ConnectionDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { csrfToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("read");
  const [environment, setEnvironment] = useState("spot_testnet");
  const connections = useQuery({
    queryKey: ["binance-connections"],
    enabled: open,
    queryFn: () =>
      api<{
        connections: {
          id: string;
          role: string;
          environment: string;
          apiKeyFingerprint: string;
          status: string;
        }[];
      }>("/api/connections/binance"),
  });
  if (!open) return null;
  return (
    <Dialog title="币安连接" onClose={onClose} drawer>
      <p className="subtle">
        API Key 只在浏览器用一次性 KMS 公钥加密。Vercel 只保存信封，不会接触
        Secret 明文。
      </p>
      <ul className="connection-list">
        {(connections.data?.connections ?? []).map((item) => (
          <li key={item.id}>
            {item.environment} · {item.role} · {item.apiKeyFingerprint} ·{" "}
            {item.status}
          </li>
        ))}
      </ul>
      <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          try {
            const context = await api<{
              enrollmentId: string;
              publicKey: string;
              kmsKeyVersion: string;
              aad: string;
            }>("/api/connections/binance/encryption-context", {
              method: "POST",
              csrf: csrfToken,
            });
            const apiKey = String(form.get("apiKey") ?? "");
            const envelope = await encryptBinanceCredentials({
              apiKey,
              apiSecret: String(form.get("apiSecret") ?? ""),
              publicKeyPem: context.publicKey,
              aad: context.aad,
            });
            await api("/api/connections/binance", {
              method: "POST",
              csrf: csrfToken,
              body: JSON.stringify({
                ...envelope,
                role,
                environment,
                enrollmentId: context.enrollmentId,
                kmsKeyVersion: context.kmsKeyVersion,
                aad: context.aad,
                apiKeyFingerprint: await fingerprintApiKey(apiKey),
                password: String(form.get("password") ?? ""),
              }),
            });
            await connections.refetch();
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
          }
        }}
      >
        <Select
          label="角色"
          value={role}
          options={[
            { value: "read", label: "只读" },
            { value: "trade", label: "交易" },
          ]}
          onChange={setRole}
        />
        <Select
          label="环境"
          value={environment}
          options={[
            { value: "spot_testnet", label: "Spot Testnet" },
            { value: "production", label: "Production" },
          ]}
          onChange={setEnvironment}
        />
        <Input label="API Key" name="apiKey" autoComplete="off" required />
        <Input
          label="API Secret"
          name="apiSecret"
          type="password"
          autoComplete="off"
          required
        />
        <Input label="当前账号密码" name="password" type="password" required />
        {error ? <p className="negative">{error}</p> : null}
        <button type="submit" className="primary-button">
          加密并保存
        </button>
      </form>
    </Dialog>
  );
}

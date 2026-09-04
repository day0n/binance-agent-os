export const actionKinds = [
  "spot.marketOrder",
  "spot.limitOrder",
  "spot.cancelOrder",
  "wallet.internalTransfer",
] as const;

export type ExecutorActionKind = (typeof actionKinds)[number];

export type ExecutorActionRequest = {
  userId: string;
  actionId: string;
  proposalHash: string;
  kind: ExecutorActionKind;
  environment: "spot_testnet" | "production";
  connectionId: string;
  envelope: {
    encryptedDek: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    kmsKeyVersion: string;
    aad: string;
  };
  payload: Record<string, string>;
  clientOrderId?: string;
};

export type ExecutorReadRequest = {
  userId: string;
  capability: "balances" | "funding" | "openOrders" | "order" | "permissions";
  connectionId: string;
  environment: "spot_testnet" | "production";
  envelope: ExecutorActionRequest["envelope"];
  values?: Record<string, string | number>;
};

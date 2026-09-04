export type IndexSpec = {
  collection: string;
  keys: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    sparse?: boolean;
    expireAfterSeconds?: number;
    name?: string;
  };
};

export const schemaIndexes: IndexSpec[] = [
  {
    collection: "users",
    keys: { usernameCanonical: 1 },
    options: { unique: true, name: "users_username_canonical" },
  },
  {
    collection: "auth_sessions",
    keys: { tokenHash: 1 },
    options: { unique: true, name: "auth_sessions_token_hash" },
  },
  {
    collection: "auth_sessions",
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: "auth_sessions_expires" },
  },
  {
    collection: "auth_sessions",
    keys: { userId: 1, revokedAt: 1 },
    options: { name: "auth_sessions_user" },
  },
  {
    collection: "chat_sessions",
    keys: { userId: 1, updatedAt: -1 },
    options: { name: "chat_sessions_user_updated" },
  },
  {
    collection: "chat_messages",
    keys: { sessionId: 1, createdAt: 1 },
    options: { name: "chat_messages_session_created" },
  },
  {
    collection: "chat_messages",
    keys: { userId: 1, requestId: 1 },
    options: { unique: true, sparse: true, name: "chat_messages_user_request" },
  },
  {
    collection: "session_events",
    keys: { sessionId: 1, seq: 1 },
    options: { unique: true, name: "session_events_seq" },
  },
  {
    collection: "binance_connections",
    keys: { userId: 1, environment: 1, role: 1 },
    options: { unique: true, name: "binance_connections_user_env_role" },
  },
  {
    collection: "actions",
    keys: { userId: 1, createdAt: -1 },
    options: { name: "actions_user_created" },
  },
  {
    collection: "actions",
    keys: { status: 1 },
    options: { name: "actions_status" },
  },
  {
    collection: "action_confirmations",
    keys: { actionId: 1 },
    options: { unique: true, name: "action_confirmations_action" },
  },
  {
    collection: "action_confirmations",
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: "action_confirmations_expires" },
  },
  {
    collection: "daily_action_ledger",
    keys: { userId: 1, utcDate: 1 },
    options: { unique: true, name: "daily_action_ledger_user_date" },
  },
  {
    collection: "audit_log",
    keys: { userId: 1, createdAt: -1 },
    options: { name: "audit_log_user_created" },
  },
  {
    collection: "runs",
    keys: { ownerId: 1, clientRequestId: 1 },
    options: { unique: true, name: "runs_owner_request" },
  },
  {
    collection: "runs",
    keys: { ownerId: 1, createdAt: -1 },
    options: { name: "runs_owner_created" },
  },
  {
    collection: "sessions",
    keys: { ownerId: 1, updatedAt: -1 },
    options: { name: "legacy_sessions_owner" },
  },
  {
    collection: "messages",
    keys: { ownerId: 1, sessionId: 1, createdAt: 1 },
    options: { name: "legacy_messages_owner_session" },
  },
  {
    collection: "artifacts",
    keys: { ownerId: 1, runId: 1 },
    options: { name: "artifacts_owner_run" },
  },
  {
    collection: "oauth_states",
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0, name: "oauth_states_expires" },
  },
  {
    collection: "memories",
    keys: { ownerId: 1, symbol: 1, availableAt: -1 },
    options: { name: "memories_owner_symbol" },
  },
];

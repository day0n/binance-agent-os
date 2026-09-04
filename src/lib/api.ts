export async function api<T>(
  path: string,
  init: RequestInit & { csrf?: string | null } = {},
) {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.csrf && method !== "GET") headers.set("x-csrf-token", init.csrf);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  } & T;
  if (!response.ok)
    throw Object.assign(new Error(data.error?.message ?? "请求失败"), {
      code: data.error?.code,
      status: response.status,
    });
  return data;
}

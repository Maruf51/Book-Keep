/**
 * Small client-side fetch helper for dashboard pages. Understands the shared
 * `{ error: { code, message } }` envelope and throws a typed error so TanStack
 * Query mutations can surface `error.message` directly.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }
): Promise<T> {
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const envelope = data as { error?: { code?: string; message?: string } } | null;
    throw new ApiClientError(
      envelope?.error?.code ?? "INTERNAL",
      envelope?.error?.message ?? `Request failed (${response.status}).`,
      response.status
    );
  }

  return data as T;
}

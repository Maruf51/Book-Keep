/**
 * Build a `Request` object that route handlers can consume in tests.
 *
 * Auth mocking is done per test file with a top-level `vi.mock("@/lib/auth", ...)`
 * (vitest hoists it above imports) backed by a mutable `authState` object so
 * individual tests can act as different users/tenants.
 */
export function buildRequest(
  method = "GET",
  body?: unknown,
  query?: Record<string, string>
): Request {
  const url = new URL(
    "http://localhost/api/test" +
      (query ? "?" + new URLSearchParams(query).toString() : "")
  );

  return new Request(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
